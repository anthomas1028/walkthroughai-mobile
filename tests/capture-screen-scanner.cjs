const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict');
const compile = path => ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
const scans = {}; vm.runInNewContext(compile('lib/barcode-scans.ts'), { exports: scans, Date, Error });
const capture = {}; vm.runInNewContext(compile('lib/capture-scans.ts'), { exports: capture, require: () => scans, Error });
const scan = scans.scannedBarcode('000123', 'code128');
let group = capture.addAreaScan({ id: 'area', name: 'Unassigned', photos: [] }, scan, 'stable-1');
assert.equal(capture.addAreaScan(group, scan, 'duplicate').scans.length, 1);
const rows = capture.captureScanRows([group]);
assert.equal(rows[0].photo, 'scan_stable-1'); assert.equal(rows[0].scanned_barcodes[0].value, '000123');
assert.equal(rows[0].part_number, ''); assert.equal(rows[0].manufacturer_part_number, ''); assert.equal(rows[0].fastenal_part_number, '');
assert.equal(capture.captureScanRows([JSON.parse(JSON.stringify(group))])[0].photo, rows[0].photo);

const states = [], refs = []; let si = 0, ri = 0, pushed;
const exported = {}, design = {};
vm.runInNewContext(compile('constants/design.ts'), { exports: design });
const jsx = (type, props) => typeof type === 'function' ? type(props) : ({ type, props });
const stubs = {
  '../components/BarcodeScanner': { BarcodeScanner: props => ({ type: 'AreaScanner', props }) },
  '../components/ScannedBarcodes': { ScannedBarcodes: () => null },
  '../lib/barcode-scans': scans, '../lib/capture-scans': capture,
  '../lib/capture-drafts': { saveCaptureDraft: async () => {} },
  '../constants/design': design, '../hooks/use-connection': { useConnection: () => ({ connection: 'offline' }) },
  '../contexts/AuthContext': { useAuth: () => ({ session: { user: { id: 'user-a' } } }) },
  '../lib/drafts': { draftKey: () => 'fixture-key', storeGroups: async (_, groups) => groups, writeDraft: async () => {}, restoreGroups: async () => [] },
  '../lib/alerts': { Alert: { alert: () => { throw Error('Unexpected alert'); } } },
  '@expo/vector-icons': { Ionicons: 'Icon' }, 'expo-image-picker': {},
  'expo-router': { router: { push: value => { pushed = value; } }, useLocalSearchParams: () => ({ customerId: '7', customerName: 'TAT Limco' }) },
  react: { useState: initial => { const i = si++; if (!(i in states)) states[i] = i === 0 ? true : i === 1 ? [{ id: 'area', name: 'Unassigned', photos: [] }] : initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; }, useRef: value => refs[ri++] ||= { current: value }, useMemo: fn => fn(), useEffect: () => {} },
  'react/jsx-runtime': { jsx, jsxs: jsx },
  'react-native': { ActionSheetIOS: {}, Image: 'Image', KeyboardAvoidingView: 'Keyboard', Modal: 'Modal', Platform: { OS: 'ios' }, Pressable: 'Button', ScrollView: 'Scroll', StyleSheet: { create: value => value }, Text: 'Text', TextInput: 'Input', View: 'View', useWindowDimensions: () => ({ width: 393, height: 852 }) },
  'react-native-safe-area-context': { SafeAreaView: 'Safe', useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
};
vm.runInNewContext(compile('app/walkthrough.tsx'), { exports: exported, require: name => { if (!(name in stubs)) throw Error(name); return stubs[name]; }, Date, Math, Promise, Error, setTimeout });
function render() { si = ri = 0; return exported.default(); }
function find(tree, type) { const values = []; const walk = node => { if (!node || typeof node !== 'object') return; if (node.type === type) values.push(node); const children = node.props?.children; (Array.isArray(children) ? children : [children]).flat().forEach(walk); }; walk(tree); return values; }
(async () => {
  let tree = render(); const scanner = find(tree, 'AreaScanner')[0];
  assert(scanner, 'The capture screen must show a scanner even with zero photos');
  assert.equal(scanner.props.blocked, false); assert.equal(scanner.props.attachLabel, 'Save scan in this area');
  await scanner.props.onAttach(scan); tree = render();
  const continueButton = find(tree, 'Button').find(button => button.props.onPress?.name === 'continueToUpload');
  assert(continueButton); assert.equal(continueButton.props.disabled, false, 'Scan-only capture must be able to continue');
  await continueButton.props.onPress(); assert.equal(pushed.pathname, '/upload'); assert.equal(pushed.params.savedDraft, 'true');
  console.log('PASS: visible area scanner at zero photos, offline scan save, stable scan identity, no invented part numbers and scan-only continuation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
