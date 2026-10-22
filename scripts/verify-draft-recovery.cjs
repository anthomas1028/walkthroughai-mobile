const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
const store=new Map();let firstRelease;
const indexedDB={open(){const req={};setTimeout(()=>{req.result={close(){},transaction(){const tx={};tx.objectStore=()=>({get(key){const r={};setTimeout(()=>{r.result=store.get(key);r.onsuccess?.()},0);return r},put(value,key){store.set(key,value);setTimeout(()=>tx.oncomplete?.(),0)},delete(key){store.delete(key);setTimeout(()=>tx.oncomplete?.(),0)}});return tx}};req.onsuccess?.()},0);return req}};
const exportsObject={};const source=ts.transpileModule(fs.readFileSync('lib/drafts.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
vm.runInNewContext(source,{exports:exportsObject,require:()=>({Platform:{OS:'web'}}),indexedDB,Map,Promise,URL:{createObjectURL:blob=>'blob:restored:'+blob.label},fetch:async uri=>({blob:async()=>{if(uri==='old')await new Promise(resolve=>firstRelease=resolve);return {label:uri}}})});
const d=exportsObject;
(async()=>{
const key=d.draftKey('user-a','customer-1');assert.notEqual(key,d.draftKey('user-b','customer-1'));
await d.storeGroups(key,[{name:'Shelf A',photos:[{id:'one',uri:'new',location:'Shelf A'}]}]);const restored=await d.restoreGroups(key);assert.equal(restored[0].photos[0].uri,'blob:restored:new');assert.equal(restored[0].name,'Shelf A');
const older=d.storeGroups(key,[{name:'Old',photos:[{uri:'old'}]}]);while(!firstRelease)await new Promise(r=>setTimeout(r,0));await d.storeGroups(key,[{name:'New',photos:[{uri:'latest'}]}]);firstRelease();await older;assert.equal((await d.readDraft(key))[0].name,'New');
firstRelease=null;const pending=d.storeGroups(key,[{name:'Old',photos:[{uri:'old'}]}]);while(!firstRelease)await new Promise(r=>setTimeout(r,0));await d.writeDraft(key,null);firstRelease();await pending;assert.equal(await d.readDraft(key),null);
console.log('PASS: photo/location restoration, account-scoped keys, stale-write prevention, discarded-draft protection.');
})().catch(e=>{console.error(e);process.exitCode=1});
