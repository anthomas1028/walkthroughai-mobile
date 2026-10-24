const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict');
function transpile(path) { return ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText; }
const scans = {}; vm.runInNewContext(transpile('lib/barcode-scans.ts'), { exports: scans, Date, Error });
const original = { photo: 'photo_001.jpg', part_number: 'KEEP', manufacturer_part_number: 'MFR-42', fastenal_part_number: '', notes: 'Original label text', is_confirmed: true };
const scan = scans.scannedBarcode('000123', 'code128');
const attached = scans.attachBarcode(original, scan);
assert.equal(attached.part_number, 'KEEP'); assert.equal(attached.manufacturer_part_number, 'MFR-42'); assert.equal(attached.fastenal_part_number, '');
assert.equal(attached.scanned_barcodes[0].value, '000123'); assert.equal(attached.is_confirmed, false);
assert.equal(scans.attachBarcode(attached, scan).scanned_barcodes.length, 1);
assert.equal(scans.removeBarcode(attached, scan).notes, original.notes);
assert.equal(scans.scanKey({ value: '048615968230', type: 'upc_a' }), scans.scanKey({ value: '0048615968230', type: 'ean13' }));
assert.throws(() => scans.scannedBarcode('bad\ncode', 'code128'));
assert.equal(scans.displayBarcode('01CODE\x1d10LOT'), '01CODE[GS]10LOT');

function fixture(existing = []) {
  const states = [], refs = []; let stateIndex = 0, refIndex = 0, effect = false, change;
  let permission = { granted: true, canAskAgain: true };
  const events = [], attachments = [], jsx = (type, props) => ({ type, props }), exports = {};
  const react = { useState: initial => { const index = stateIndex++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
    useRef: initial => { const index = refIndex++; return refs[index] ||= { current: initial }; }, useEffect: fn => { if (!effect) { effect = true; fn(); } } };
  vm.runInNewContext(transpile('components/BarcodeScanner.tsx'), { exports, Error, require: name => ({
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { AppState: { currentState: 'active', addEventListener: (_, callback) => { change = callback; return { remove() {} }; } }, Linking: { openSettings() {} }, Pressable: 'Button', Text: 'Text', View: 'View' },
    'expo-camera': { CameraView: 'Camera', useCameraPermissions: () => [permission, async () => {}] }, '../lib/barcode-scans': scans,
  }[name]) });
  function render() { stateIndex = refIndex = 0; return exports.BarcodeScanner({ existing, otherScans: [], blocked: false, onAttach: async value => attachments.push(value), onBusy: value => events.push(value) }); }
  function nodes(tree, type) { const result = []; const walk = node => { if (!node || typeof node !== 'object') return; if (node.type === type) result.push(node); const children = node.props?.children; (Array.isArray(children) ? children : [children]).flat().forEach(walk); }; walk(tree); return result; }
  return { render, nodes, attachments, events, background: () => change('background'), deny: () => { permission = { granted: false, canAskAgain: false }; } };
}
(async () => {
  const f = fixture(); let tree = f.render();
  assert.equal(f.nodes(tree, 'Camera').length, 0);
  f.nodes(tree, 'Button')[0].props.onPress(); tree = f.render();
  const camera = f.nodes(tree, 'Camera')[0]; assert(camera);
  camera.props.onBarcodeScanned({ data: '000123', type: 'code128' });
  camera.props.onBarcodeScanned({ data: 'SHOULD-NOT-REPLACE-FIRST', type: 'code128' });
  assert.equal(f.attachments.length, 0, 'Camera events must never silently attach a code');
  tree = f.render(); assert.equal(f.nodes(tree, 'Camera').length, 0, 'Pause after first result');
  const attach = f.nodes(tree, 'Button').find(button => button.props.children?.props?.children === 'Attach code to this item');
  await Promise.all([attach.props.onPress(), attach.props.onPress()]);
  assert.equal(f.attachments.length, 1, 'Repeated attach taps must not duplicate the action');
  assert.equal(f.attachments[0].value, '000123');
  const duplicate = fixture([scan]); tree = duplicate.render(); duplicate.nodes(tree, 'Button')[0].props.onPress(); tree = duplicate.render();
  duplicate.nodes(tree, 'Camera')[0].props.onBarcodeScanned({ data: '000123', type: 'code128' }); tree = duplicate.render();
  assert(duplicate.nodes(tree, 'Button').find(button => button.props.children?.props?.children === 'Attach code to this item').props.disabled);
  const paused = fixture(); tree = paused.render(); paused.nodes(tree, 'Button')[0].props.onPress(); paused.background();
  assert.equal(paused.nodes(paused.render(), 'Camera').length, 0);
  const denied = fixture(); denied.deny(); tree = denied.render(); denied.nodes(tree, 'Button')[0].props.onPress();
  assert.equal(denied.nodes(denied.render(), 'Camera').length, 0);
  console.log('PASS: leading zeros, separate fields, duplicate detection, explicit attachment, rapid-tap protection, camera permissions and background pause.');
})().catch(error => { console.error(error); process.exitCode = 1; });
