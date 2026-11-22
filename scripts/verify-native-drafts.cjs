const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const metadata = new Map();
const files = new Set(["cache:photo"]);
let failAfter = Infinity;
const storage = {
  getItem: async key => metadata.get(key) || null,
  setItem: async (key, value) => {
    if (JSON.parse(value)[0].photos.length > failAfter) throw new Error("Storage full");
    metadata.set(key, value);
  },
  removeItem: async key => metadata.delete(key),
};
const fileSystem = {
  documentDirectory: "file:documents/",
  makeDirectoryAsync: async () => {},
  deleteAsync: async path => {
    for (const file of files) if (file === path || (path.endsWith("/") && file.startsWith(path))) files.delete(file);
  },
  getInfoAsync: async uri => ({ exists: files.has(uri) }),
  copyAsync: async ({ from, to }) => {
    files.add(to);
    if (!files.has(from)) throw new Error("Original unavailable");
  },
  moveAsync: async ({ from, to }) => {
    assert(files.delete(from));
    files.add(to);
  },
};
const source = ts.transpileModule(fs.readFileSync("lib/drafts.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
function loadDrafts() {
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    require: name => name === "react-native" ? { Platform: { OS: "ios" } }
      : name.includes("async-storage") ? { default: storage } : fileSystem,
  });
  return exports;
}

async function run() {
  const drafts = loadDrafts();
  const key = drafts.draftKey("test", "customer");
  await drafts.storeGroups(key, [{ id: "a", photos: [{ id: "one", uri: "cache:photo" }] }]);
  files.delete("cache:photo");
  let groups = await drafts.restoreGroups(key);
  assert(files.has(groups[0].photos[0].uri));
  await drafts.storeGroups(key, groups);
  await drafts.writeDraft(key, null);
  assert.equal(await drafts.restoreGroups(key), null);

  const photos = Array.from({ length: 500 }, (_, i) => ({
    id: String(i), uri: "cache:" + i, assetId: "asset:" + i, fileName: i + ".heic",
  }));
  photos.forEach(photo => files.add(photo.uri));
  files.delete(photos[3].uri);
  const checkpoints = [];
  const onCheckpoint = (added, failed) => {
    checkpoints.push([added, failed]);
    assert.equal(JSON.parse(metadata.get(key))[0].photos.length, added);
  };
  const initial = [{ id: "a", photos: [] }];
  await drafts.storeGroups(key, initial, { groupId: "a", photos, onCheckpoint });
  assert.deepEqual(checkpoints.at(-1), [499, 1]);
  assert(checkpoints.length > 1);
  groups = await loadDrafts().restoreGroups(key);
  assert.equal(groups[0].photos.length, 499);
  assert(groups[0].photos.every(photo => photo.uri.endsWith(".heic") && files.has(photo.uri)));
  assert(![...files].some(name => name.endsWith(".partial")));
  files.add(photos[3].uri);
  await drafts.storeGroups(key, groups, { groupId: "a", photos: [photos[3]], onCheckpoint: () => {} });
  assert.equal((await drafts.restoreGroups(key))[0].photos.length, 500);
  await drafts.writeDraft(key, null);

  failAfter = 16;
  await drafts.storeGroups(key, initial, { groupId: "a", photos, onCheckpoint });
  assert.deepEqual(checkpoints.at(-1), [16, 484]);
  assert.equal((await loadDrafts().restoreGroups(key))[0].photos.length, 16);
  assert.equal([...files].filter(uri => uri.startsWith(fileSystem.documentDirectory)).length, 16);
  console.log("PASS: 500-photo import, original formats, partial copy failure, retry, committed counts, storage interruption and reopen.");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
