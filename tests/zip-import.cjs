const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { zipSync } = require('fflate');
const loader = (file, deps = {}) => {
  const code = ts.transpileModule(fs.readFileSync(path.join('lib', file + '.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  Function('exports', 'require', code)(exports, name => deps[name] || require(name));
  return exports;
};
const exporter = loader('photo-zip');
const reader = loader('zip-photos', { './photo-zip': exporter });
const { importPhotoZip } = loader('import-photo-zip', { './zip-photos': reader });
const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlPaB8AAAAASUVORK5CYII=', 'base64'));
function source(bytes) {
  return { size: bytes.length, read: async (at, len) => bytes.subarray(at, at + len) };
}
async function contents(src, entry) {
  const chunks = [];
  await reader.extractZipPhoto(src, entry, chunk => chunks.push(Buffer.from(chunk)));
  return Buffer.concat(chunks);
}
test('nested photos retain bytes and names, hidden metadata and documents are skipped', async () => {
  const src = source(zipSync({ './Area A/IMG001.PNG': png, 'Area B/IMG001.PNG': png, '__MACOSX/._IMG001.PNG': png,
    'Area A/.DS_Store': png, 'notes.pdf': png, '../outside.png': png, 'inner.zip': png }));
  const { photos, ignored } = await reader.listZipPhotos(src);
  assert.equal(photos.length, 2);
  assert.equal(photos[0].name, 'IMG001.PNG');
  assert.equal(ignored, 2);
  assert.deepEqual(await contents(src, photos[0]), Buffer.from(png));
});
test('imports native and web WalkthroughAI export formats, including streaming ZIP data descriptors', async () => {
  const parts = [];
  const native = new exporter.PhotoZip(bytes => parts.push(bytes));
  native.add('Receiving/01.png', png);
  native.finish();
  const { downloadZip } = await import('client-zip');
  const web = await downloadZip([{ name: 'Receiving/01.png', input: png }]).arrayBuffer();
  for (const data of [new Uint8Array(Buffer.concat(parts)), new Uint8Array(web)]) {
    const src = source(data);
    const { photos } = await reader.listZipPhotos(src);
    assert.deepEqual(await contents(src, photos[0]), Buffer.from(png));
  }
});
test('rejects truncated archives and damaged, mislabeled, or encrypted photos', async () => {
  const bytes = zipSync({ 'one.png': png }, { level: 0 });
  await assert.rejects(reader.listZipPhotos(source(bytes.subarray(0, bytes.length - 5))), /damaged/);
  const src = source(bytes);
  const { photos: [photo] } = await reader.listZipPhotos(src);
  await assert.rejects(contents(src, { ...photo, encrypted: true }), /password/);
  await assert.rejects(contents(src, { ...photo, size: photo.size - 1 }), /damaged/);
  await assert.rejects(contents(src, { ...photo, mime: 'image/jpeg' }), /format/);
  bytes[40] ^= 1;
  await assert.rejects(contents(src, photo), /damaged/);
});
test('retains good photos, accounts for corrupt entries, retries, and remaining capacity', async () => {
  const src = source(zipSync({ 'a.png': png, 'again.png': png, 'bad.jpg': Uint8Array.of(2, 5, 7), 'b.png': Uint8Array.of(...png, 2), 'c.png': Uint8Array.of(...png, 3) }));
  const released = [];
  const seen = new Set();
  const archive = { source: src, async photo(entry) {
    await contents(src, entry);
    return { fileName: entry.name, fileSize: entry.size, release: ok => released.push(ok) };
  }};
  const saved = [];
  const run = slots => importPhotoZip(archive, slots, new Set(seen), async batch => {
    for (const item of batch) { saved.push(item.fileName); seen.add(item.assetId); }
  }, () => {}, () => true);
  const first = await run(2);
  assert.deepEqual(saved, ['a.png', 'b.png']);
  assert.deepEqual([first.added, first.failed, first.duplicates, first.overLimit], [2, 1, 1, 1]);
  const second = await run(1);
  assert.deepEqual([second.added, second.failed, second.duplicates], [1, 1, 3]);
  assert.deepEqual(released, [true, true, true]);
});
test('failed storage checkpoint preserves previous batch and frees pending files', async () => {
  const files = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + '.png', Uint8Array.of(...png, i)]));
  const released = [];
  const archive = { source: source(zipSync(files)), photo: async entry => ({
    fileSize: entry.size, release: saved => released.push(saved),
  })};
  let writes = 0;
  await assert.rejects(importPhotoZip(archive, 500, new Set(), async () => {
    if (++writes === 2) throw new Error('disk full');
  }, () => {}, () => true), /disk full/);
  assert.equal(released.filter(Boolean).length, 8);
  assert.equal(released.filter(value => !value).length, 2);
});
test('native Files picker reads an archive by range and saves photos before releasing temporary files', async () => {
  const bytes = zipSync({ 'area/photo.png': png });
  const disk = new Map([['file:///originals/archive.zip', bytes]]);
  class File {
    static async pickFileAsync(_start, type) { assert.equal(type, 'application/zip'); return new File({ uri: 'file:///originals' }, 'archive.zip'); }
    constructor(dir, name) { this.uri = dir.uri + '/' + name; }
    get exists() { return disk.has(this.uri); }
    create() { disk.set(this.uri, new Uint8Array()); }
    delete() { disk.delete(this.uri); }
    open() {
      const file = this;
      return { offset: 0, size: disk.get(this.uri).length, close() {},
        readBytes(len) { const result = disk.get(file.uri).slice(this.offset, this.offset + len); this.offset += len; return result; },
        writeBytes(chunk) { disk.set(file.uri, Uint8Array.from([...disk.get(file.uri), ...chunk])); },
      };
    }
  }
  class Directory {
    constructor(dir, name) { this.uri = dir.uri + '/' + name; }
    create() {}
    delete() { for (const key of disk.keys()) if (key.startsWith(this.uri + '/')) disk.delete(key); }
  }
  const { pickPhotoZip } = loader('pick-photo-zip', { './zip-photos': reader, 'react-native': { Image: { async getSize(uri) {
    assert.deepEqual(disk.get(uri), png); return { width: 1, height: 1 };
  } } }, 'expo-file-system/legacy': {}, 'expo-file-system': { File, Directory, Paths: { cache: {uri:'file:///cache'}, document: {uri:'file:///document/'} } } });
  const archive = await pickPhotoZip();
  const { photos } = await reader.listZipPhotos(archive.source);
  const original = await archive.photo(photos[0]);
  assert.equal(original.fileName, 'photo.png'); assert.deepEqual(disk.get(original.uri), png);
  original.release(true); archive.close();
  assert.deepEqual([...disk.keys()], ['file:///originals/archive.zip']);
});
