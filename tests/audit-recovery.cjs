const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function load(file, deps = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:n=>deps[n],Promise,JSON,Date,Error,Number,Set,Map});
  return exports;
}
(async () => {
  const {recoverUploadSession} = load('lib/upload-session.ts');
  for (const status of [404,410]) {
    let created=0, saved;
    const result=await recoverUploadSession({uploadId:'expired',photoCount:100,
      status:async()=>({status,ok:false,json:()=>{throw Error('HTML error page')}}),
      create:async()=>{created++;return 'replacement'},checkpoint:async(id,slots)=>saved={id,slots}});
    assert.equal(created,1);assert.equal(result.uploadId,'replacement');assert.equal(result.uploaded.size,0);
    assert.equal(saved.id,'replacement');
  }
  let created=0;
  const common={uploadId:'existing',photoCount:100,create:async()=>{created++;return 'bad'},checkpoint:async()=>{}};
  const resumed=await recoverUploadSession({...common,status:async()=>({ok:true,json:async()=>({photo_count:100,uploaded_slots:Array.from({length:73},(_,i)=>i)})})});
  assert.equal(resumed.uploaded.size,73);assert(resumed.uploaded.has(72));assert(!resumed.uploaded.has(99));
  const completed=await recoverUploadSession({...common,status:async()=>({ok:true,json:async()=>({photo_count:100,uploaded_slots:[],result:{job_id:'already-submitted'}})})});
  assert.equal(completed.result.job_id,'already-submitted');
  for(const status of [401,403,429,500,503]) await assert.rejects(recoverUploadSession({...common,status:async()=>({ok:false,status})}));
  await assert.rejects(recoverUploadSession({...common,status:async()=>({ok:true,json:async()=>({photo_count:99})})}));
  assert.equal(created,0,'Uncertain server/auth responses must never start a replacement analysis');

  for(const [file,read,write,first,second] of [
    ['lib/recovery.ts','loadRecovery','saveRecovery',{version:1,customerId:'a',results:[]},{version:1,customerId:'b',results:[]}],
    ['lib/capture-drafts.ts','captureDrafts','saveCaptureDraft',{customerId:'a',photoCount:1},{customerId:'b',photoCount:1}]
  ]) {
    const values=new Map();let fail=false;
    const storage={getItem:async k=>values.get(k)||null,setItem:async(k,v)=>{if(fail)throw Error('quota exceeded');values.set(k,v)}};
    const lib=load(file,{'@react-native-async-storage/async-storage':{default:storage},'expo-file-system':{},'react-native':{Platform:{OS:'web'}},'./supabase':{}});
    const save=d=>file.includes('capture-drafts')?lib[write]('owner',d):lib[write](d,'owner');
    await save(first);fail=true;await assert.rejects(save(second));
    const recovered=await lib[read]('owner');assert(recovered,'Previously saved draft survives a later quota failure');
    fail=false;await save(second);assert(await lib[read]('owner'));
  }
  console.log('PASS: 100-photo reconciliation, expired session renewal, lost submission response, server error protection, storage failure recovery.');
})().catch(e=>{console.error(e);process.exitCode=1});
