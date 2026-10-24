const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict');
const metadata = new Map(), files = new Map([['cache:photo', 'original pixels']]);
const storage = { getItem: async key => metadata.get(key) || null, setItem: async (key, value) => metadata.set(key, value), removeItem: async key => metadata.delete(key) };
class Directory { constructor(...parts) { this.uri = parts.map(p => typeof p === 'object' ? p.uri : p).join('/').replace(/\/$/, '') + '/'; } create() {} }
class File { constructor(...parts) { this.uri = parts.map(p => typeof p === 'object' ? p.uri : p).join('/'); } get exists() { return files.has(this.uri); } copy(target) { assert(files.has(this.uri)); files.set(target.uri, files.get(this.uri)); } delete() { files.delete(this.uri); } }
let authCalls = 0;
function load(path) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    exports, require: name => {
      if (name.includes('async-storage')) return { default: storage };
      if (name === 'expo-file-system') return { Directory, File, Paths: { document: { uri: 'file:documents' } } };
      if (name === 'react-native') return { Platform: { OS: 'ios' } };
      if (name === './supabase') return { supabase: { auth: { getSession: async () => { authCalls++; throw Error('Network unavailable'); } } } };
      throw Error(name);
    }, Promise, JSON, Date, Map,
  });
  return exports;
}
(async () => {
  let recovery = load('lib/recovery.ts');
  const photos = await recovery.retainPhotos([{ id: 'first', uri: 'cache:photo', location: 'Bin 1' }], 'offline');
  const draft = { version: 1, customerId: '7', customerName: 'Synthetic', contactName: '', photos, prepared: [], uploadId: '', uploaded: [], jobId: '', results: [], uploadRequested: true, updatedAt: '' };
  await recovery.saveRecovery(draft, 'user-a');
  files.delete('cache:photo');
  recovery = load('lib/recovery.ts'); // Simulate reopening the app with no connection.
  const restored = await recovery.loadRecovery('user-a');
  assert(restored.uploadRequested); assert.equal(restored.photos.length, 1);
  assert.equal(files.get(restored.photos[0].uri), 'original pixels');
  assert.equal(await recovery.loadRecovery('user-b'), null);
  assert.equal(authCalls, 0, 'Offline device saves must not refresh authentication');
  await recovery.saveRecovery({ ...restored, uploadRequested: false }, 'user-a');
  assert.equal((await recovery.loadRecovery('user-a')).uploadRequested, false);
  const capture = load('lib/capture-drafts.ts');
  await capture.saveCaptureDraft('user-a', { customerId: '7', customerName: 'Synthetic', contactName: '', photoCount: 2 });
  assert.equal((await capture.captureDrafts('user-a'))[0].photoCount, 2);
  assert.equal((await capture.captureDrafts('user-b')).length, 0);
  await capture.saveCaptureDraft('user-a', { customerId: '7', customerName: 'Synthetic', contactName: '', photoCount: 0 });
  assert.equal((await capture.captureDrafts('user-a')).length, 0);
  const sources = load('lib/source-photos.ts');
  const paired = sources.sourcePhotos([{ photo: 'original.jpg', photo_url: 'original-url', retake_evidence: [{ photo: 'closeup.jpg', photo_url: 'closeup-url' }] }, { photo_url: 'original-url' }]);
  assert.equal(paired.length, 2); assert(paired.some(p => p.uri === 'closeup-url'));
  console.log('PASS: offline save/reopen, original-byte retention, account isolation, queue pause, capture discovery and paired-photo navigation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
