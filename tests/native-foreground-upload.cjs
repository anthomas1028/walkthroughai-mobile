const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const code = ts.transpileModule(fs.readFileSync('lib/native-upload.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;

async function verify({ jpeg = true, cancel = false, status = 200 } = {}) {
  const sent = [], removed = [], percentages = [];
  const controller = new AbortController();
  let closed = false, cancelled = false;
  const source = 'file:///saved/original';
  const output = {};
  const modules = {
    'expo-modules-core': { requireOptionalNativeModule: () => ({}) },
    'expo-constants': {},
    'react-native': { Platform: { OS: 'ios' } },
    './supabase': { supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'fixture' } } }) } } },
    './api': { API_BASE_URL: 'https://fixture.invalid' },
    'expo-file-system': { File: class {
      constructor(uri) { assert.equal(uri, source); }
      open() { return { readBytes: () => jpeg ? [255, 216] : [0, 1], close: () => { closed = true; } }; }
    } },
    'expo-image-manipulator': { SaveFormat: { JPEG: 'jpeg' }, manipulateAsync: async (uri, actions, options) => {
      assert.equal(uri, source); assert.equal(actions.length, 0); assert.equal(options.compress, 1);
      return { uri: 'file:///temporary/jpeg' };
    } },
    'expo-file-system/legacy': {
      FileSystemUploadType: { BINARY_CONTENT: 0 }, FileSystemSessionType: { FOREGROUND: 1 },
      deleteAsync: async uri => { removed.push(uri); },
      createUploadTask(url, uri, options, progress) {
        sent.push({ url, uri, options });
        return {
          uploadAsync: async () => {
            progress({ totalBytesSent: 512, totalBytesExpectedToSend: 1024 });
            if (cancel) { controller.abort(); return null; }
            return { status, body: '{"success":true}' };
          },
          cancelAsync: async () => { cancelled = true; }
        };
      }
    }
  };
  vm.runInNewContext(code, { exports: output, require: name => {
    assert.ok(modules[name], name); return modules[name];
  } });
  const request = output.sendPhotoWhileOpen('batch', 1, [{}, { uri: source }], controller.signal, n => percentages.push(n));
  if (status === 503) await assert.rejects(request, /503/);
  else await request;
  assert.ok(closed);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, 'https://fixture.invalid/api/native-batches/batch/1');
  assert.equal(sent[0].uri, jpeg ? source : 'file:///temporary/jpeg');
  assert.equal(sent[0].options.httpMethod, 'PUT');
  assert.equal(sent[0].options.sessionType, 1);
  assert.equal(sent[0].options.headers['X-Photo-Count'], '2');
  assert.deepEqual(percentages, [50]);
  assert.equal(cancelled, cancel);
  assert.deepEqual(removed, jpeg ? [] : ['file:///temporary/jpeg']);
}

(async () => {
  await verify();
  await verify({ jpeg: false });
  await verify({ jpeg: false, cancel: true });
  await verify({ jpeg: false, status: 503 });
  console.log('PASS: foreground upload reuses a batch slot, retains originals and cleans up on success, interruption or HTTP failure.');
})().catch(error => { console.error(error); process.exitCode = 1; });
