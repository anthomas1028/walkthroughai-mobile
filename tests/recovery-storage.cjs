const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict');
const metadata = new Map(), files = new Map([['cache:photo', 'original pixels']]);
let user = 'user-a';
const storage = { getItem: async key => metadata.get(key) || null, setItem: async (key, value) => metadata.set(key, value), removeItem: async key => metadata.delete(key) };
class Directory { constructor(...parts) { this.uri = parts.map(p => typeof p === 'object' ? p.uri : p).join('/').replace(/\/$/, '') + '/'; } create() {} }
class File { constructor(...parts) { this.uri = parts.map(p => typeof p === 'object' ? p.uri : p).join('/'); } get exists() { return files.has(this.uri); } copy(target) { assert(files.has(this.uri)); files.set(target.uri, files.get(this.uri)); } delete() { files.delete(this.uri); } }
const out = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/recovery.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports: out, require: name => {
 if (name.includes('async-storage')) return { default: storage };
 if (name === 'expo-file-system') return { Directory, File, Paths: { document: { uri: 'file:documents' } } };
 if (name === 'react-native') return { Platform: { OS: 'ios' } };
 if (name === './supabase') return { supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: user } } } }) } } };
 throw Error(name);
}, Promise, JSON, Date });
(async () => {
 const photos = await out.retainPhotos([{id:'first',uri:'cache:photo',location:'Bin 1'}], 'source-test');
 files.delete('cache:photo');
 assert.equal(files.get(photos[0].uri), 'original pixels');
 const draft = {version:1,customerId:'7',customerName:'Synthetic',contactName:'',photos,prepared:photos,uploadId:'upload',uploaded:[0],jobId:'job',results:[{photo:'photo_001.jpg',part_number:'00123',is_confirmed:true}],updatedAt:''};
 await out.saveRecovery(draft);
 const loaded = await out.loadRecovery();
 assert.equal(loaded.uploadId,'upload'); assert.equal(loaded.jobId,'job'); assert.equal(loaded.results[0].part_number,'00123');
 user='user-b'; assert.equal(await out.loadRecovery(),null);
 user='user-a'; await out.saveRecovery({...draft,results:[{part_number:'00124'}]});
 assert.equal((await out.loadRecovery()).results[0].part_number,'00124');
 await out.clearRecovery(); assert.equal(await out.loadRecovery(),null); assert.equal(files.has(photos[0].uri),false);
 console.log('PASS: durable source copies, upload/job/review restoration, account isolation, ordered writes and local cleanup.');
})().catch(error => {console.error(error);process.exitCode=1;});
