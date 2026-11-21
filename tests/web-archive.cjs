const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const { unzipSync } = require('fflate');

const compiled = ts.transpileModule(fs.readFileSync('lib/web-archive.web.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const denied = () => { throw new DOMException('Unavailable', 'SecurityError'); };
const photo = Uint8Array.of(255, 216, 42, 255, 217);

async function browser(picker, storage) {
  const zip = await import('client-zip');
  const exports = {};
  const output = { reads: 0, clicks: 0, timers: [] };
  const anchor = { remove() {}, click() { output.clicks++; } };
  vm.runInNewContext(compiled, {
    exports, require: () => zip, window: { showSaveFilePicker: picker }, navigator: { storage },
    crypto, DOMException, document: { body: { appendChild() {} }, createElement: () => anchor },
    URL: { createObjectURL(blob) { output.blob = blob; return 'blob:test'; }, revokeObjectURL() {} },
    setTimeout(callback) { output.timers.push(callback); },
  });
  output.save = (entries = async function* () {
    output.reads++;
    yield { name: 'Area/photo.jpg', input: photo };
  }) => exports.saveWebArchive('walkthrough.zip', entries);
  return output;
}

test('blocked picker and blocked temporary storage still produce one intact ZIP', async () => {
  const run = await browser(denied, { getDirectory: denied });
  await run.save();
  assert.equal(run.clicks, 1);
  assert.equal(run.reads, 1);
  assert.deepEqual(unzipSync(new Uint8Array(await run.blob.arrayBuffer()))['Area/photo.jpg'], photo);
});

test('cancel leaves the download cancelled without reading photos', async () => {
  const run = await browser(() => { throw new DOMException('Cancelled', 'AbortError'); }, {});
  await assert.rejects(run.save(), { name: 'AbortError' });
  assert.equal(run.clicks, 0);
  assert.equal(run.reads, 0);
});

test('direct streaming writes the original bytes and never starts a second export', async () => {
  const chunks = [];
  const run = await browser(() => ({ createWritable: () => new WritableStream({write: c => chunks.push(c)}) }), {});
  await run.save();
  assert.equal(run.reads, 1);
  assert.equal(run.clicks, 0);
  const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
  assert.deepEqual(unzipSync(bytes)['Area/photo.jpg'], photo);
});

test('a read error after streaming begins propagates without fetching twice', async () => {
  const run = await browser(() => ({ createWritable: () => new WritableStream() }), {});
  let attempts = 0;
  await assert.rejects(run.save(async function* () { attempts++; yield { name: 'first.jpg', input: photo }; denied(); }), {name:'SecurityError'});
  assert.equal(attempts, 1);
  assert.equal(run.clicks, 0);
});

test('a denied temporary writer uses a regular download and releases its file', async () => {
  let cleaned = 0;
  const run = await browser(undefined, { getDirectory: () => ({
    getFileHandle: () => ({ createWritable: denied }), removeEntry: async () => { cleaned++; },
  }) });
  await run.save();
  assert.equal(run.reads, 1);
  assert.equal(run.clicks, 1);
  run.timers.forEach(fn => fn());
  assert.equal(cleaned, 1);
});
