const assert = require('node:assert/strict');
const {test} = require('node:test');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const compiled = ts.transpileModule(fs.readFileSync('lib/source-photos.ts','utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;
const helpers = {};
vm.runInNewContext(compiled, {exports: helpers});
const { savedPhotoGroups } = helpers;
const name = i => 'photo_' + String(i).padStart(3, '0') + '.jpeg';

test('WeldCo-style gallery keeps photo 7 in place when photo 6 has no row', () => {
  const originals = Array.from({length:9}, (_,i) => ({name:name(i+1), uri:'storage/'+(i+1), area:'Aisle'}));
  const rows = originals.filter(p => p.name !== name(6)).map(p => ({photo:p.name, photo_url:'row/'+p.name}));
  rows.push({...rows[6]},{photo:'scan_1', photo_url:'unused'});
  const groups = savedPhotoGroups(rows, originals);
  assert.equal(groups.length,9);
  assert.equal(groups[5].title,'Photo 6');
  assert.equal(groups[5].itemCount,0);
  assert.equal(groups[5].uri,'storage/6');
  assert.equal(groups[6].title,'Photo 7');
  assert.equal(groups[6].uri,'row/'+name(7));
  assert.equal(groups[7].itemCount,2);
  assert.equal(savedPhotoGroups(rows,[])[5].title,'Photo 7');
});

test('combined legacy references and close-ups keep their own images', () => {
  const groups = savedPhotoGroups([{photo:'a.jpg, b.jpg',photo_url:'a-original',retake_evidence:[
    {photo:'closeup.jpeg',photo_url:'closeup-original'}]}], [{name:'b.jpg',uri:'b-original'}]);
  assert.equal(groups.length,3);
  assert.equal(groups[0].uri,'a-original');
  assert.equal(groups[1].uri,'b-original');
  assert.equal(groups[1].itemCount,1);
  assert.equal(groups[2].uri,'closeup-original');
  assert.match(groups[2].title,/close-up/);
});
