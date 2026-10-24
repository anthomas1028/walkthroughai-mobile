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

function fixture(existing = [], options = {}) {
  const states = [], refs = []; let stateIndex = 0, refIndex = 0, effect = false, change;
  let permission = { granted: true, canAskAgain: true };
  const events = [], attachments = [], pictures = [], feedback = [], jsx = (type, props) => ({ type, props }), exports = {};
  const react = { useState: initial => { const index = stateIndex++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
    useRef: initial => { const index = refIndex++; return refs[index] ||= { current: initial }; }, useEffect: fn => { if (!effect) { effect = true; fn(); } } };
  vm.runInNewContext(transpile('components/BarcodeScanner.tsx'), { exports, Error, require: name => ({
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-haptics': { notificationAsync: async value => feedback.push(value), NotificationFeedbackType: { Warning: 'warning', Success: 'success' } },
    'react-native': { Image: 'Image', AppState: { currentState: 'active', addEventListener: (_, callback) => { change = callback; return { remove() {} }; } }, Linking: { openSettings() {} }, Pressable: 'Button', Text: 'Text', View: 'View' },
    'expo-camera': { CameraView: 'Camera', useCameraPermissions: () => [permission, async () => {}] }, '../lib/barcode-scans': scans,
  }[name]) });
  function render() { stateIndex = refIndex = 0; return exports.BarcodeScanner({ existing, otherScans: [], blocked: false, onAttach: async (value, photo) => { if (options.fail) throw Error('Storage full'); attachments.push(value); pictures.push(photo); }, onBusy: value => events.push(value), ...options }); }
  function nodes(tree, type) { const result = []; const walk = node => { if (!node || typeof node !== 'object') return; if (node.type === type) result.push(node); const children = node.props?.children; (Array.isArray(children) ? children : [children]).flat().forEach(walk); }; walk(tree); return result; }
  return { render, nodes, attachments, pictures, feedback, events, setCamera: value => { refs[0].current = value; }, background: () => change('background'), deny: () => { permission = { granted: false, canAskAgain: false }; } };
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
  const continuous = fixture([], { continuous: true, allowLabelPhoto: true });
  tree = continuous.render(); continuous.nodes(tree, 'Button')[0].props.onPress(); tree = continuous.render();
  continuous.setCamera({ takePictureAsync: async () => ({ uri: 'file:///label.jpg', width: 1800, height: 2400 }) });
  continuous.nodes(tree, 'Camera')[0].props.onBarcodeScanned({ data: 'FIRST', type: 'code128' }); tree = continuous.render();
  assert.equal(continuous.feedback[0], 'success');
  continuous.nodes(tree, 'Button').find(b => b.props.accessibilityLabel === 'Increase counted quantity').props.onPress(); tree = continuous.render();
  await continuous.nodes(tree, 'Button').find(b => b.props.children?.props?.children === 'Add label photo (optional)').props.onPress(); tree = continuous.render();
  assert.equal(continuous.nodes(tree, 'Image').length, 1);
  await continuous.nodes(tree, 'Button').find(b => b.props.children?.props?.children === 'Save & next').props.onPress(); tree = continuous.render();
  assert.equal(continuous.attachments[0].quantity, 2); assert.equal(continuous.pictures[0].uri, 'file:///label.jpg');
  assert(continuous.nodes(tree, 'Camera')[0].props.onBarcodeScanned, 'Ready for next scan without reopening');
  assert.equal(continuous.events.at(-1), true, 'Capture screen stays locked until scanner closes');
  continuous.nodes(tree, 'Camera')[0].props.onBarcodeScanned({ data: 'SECOND', type: 'code128' }); tree = continuous.render();
  await continuous.nodes(tree, 'Button').find(b => b.props.children?.props?.children === 'Save & next').props.onPress();
  assert.equal(continuous.attachments[1].quantity, 1); assert.equal(continuous.pictures[1], undefined, 'Next scan must not inherit previous photo');
  const failure = fixture([], { continuous: true, fail: true }); tree = failure.render(); failure.nodes(tree, 'Button')[0].props.onPress(); tree = failure.render(); failure.nodes(tree, 'Camera')[0].props.onBarcodeScanned({ data: 'RETRY', type: 'code128' }); tree = failure.render(); await failure.nodes(tree, 'Button').find(b => b.props.children?.props?.children === 'Save & next').props.onPress();
  assert.equal(failure.attachments.length, 0); assert(failure.nodes(failure.render(), 'Button').find(b => b.props.children?.props?.children === 'Save & next'), 'Failed save keeps scanned code available for retry');
  console.log('PASS: leading zeros, separate fields, duplicate detection, explicit attachment, rapid-tap protection, camera permissions and background pause.');
})().catch(error => { console.error(error); process.exitCode = 1; });
