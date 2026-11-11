const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync('app/upload.tsx','utf8');
const start=source.indexOf('  async function finalizeWalkthrough('),end=source.indexOf('\n  function finishWithReviewItems()',start);
const code=ts.transpileModule(source.slice(start,end).replace('async function','export async function'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
(async()=>{
 let release,calls=0,download,error,cleanup=0;
 const ctx={exports:{},finalizationBusy:{current:false},recipientEmail:'',results:[],completedCustomer:'Synthetic',walkthroughName:'Synthetic',walkthroughTitle:'Audit',customerId:'1',selectedContactName:'',currentJobId:'job',FINALIZE_API_URL:'/api/finalize',photos:[],session:{user:{id:'owner'}},activeKey:'active',photoDraftKey:'photos',recoveryRef:{current:{photos:[]}},completedPhotoCleanup:{current:null},
   apiFetch:async()=>{calls++;await new Promise(r=>release=r);return {ok:true}},readJsonResponse:async()=>({success:true,download_url:'saved.xlsx',results:[]}),normalizeResult:r=>r,
   setIsFinalizing:()=>{},setErrorMessage:v=>error=v,setResults:()=>{},setPhotos:()=>{},setCorrectedWorkbookUrl:v=>download=v,
   clearRecovery:async()=>{cleanup++;throw Error('local storage failure')},AsyncStorage:{multiRemove:async()=>{}},writeDraft:async()=>{},saveCaptureDraft:async()=>{},setEmailSent:()=>{},setEmailedRecipient:()=>{},Alert:{alert:()=>{throw Error('Should not claim successful report failed')}},console,Error,Array};
 vm.runInNewContext(code,ctx);
 const first=ctx.exports.finalizeWalkthrough(false);
 assert.equal(await ctx.exports.finalizeWalkthrough(false),null);assert.equal(calls,1);
 release();assert.equal(await first,'saved.xlsx');assert.equal(download,'saved.xlsx');assert.equal(cleanup,1);assert.match(error,/report is saved in History/);assert.equal(ctx.finalizationBusy.current,false);
 console.log('PASS: repeated Finalize taps submit once; local cleanup failure keeps the saved workbook available.');
})().catch(e=>{console.error(e);process.exitCode=1});
