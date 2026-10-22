const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
const code=ts.transpileModule(fs.readFileSync('components/RecoveryBanner.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
(async()=>{
 for(const status of ['queued','complete','failed']) {
  const state=[],effects=[],routes=[];let cursor=0;
  const draft={customerId:'customer-a',customerName:'Customer A',photos:[{id:'1'},{id:'2'}],nativeBatchId:'batch-a',jobId:'',results:[]};
  const output={};
  vm.runInNewContext(code,{exports:output,setInterval:()=>1,clearInterval:()=>{},require:name=>{
   if(name==='react')return{useState:init=>{const i=cursor++;if(!(i in state))state[i]=init;return[state[i],v=>state[i]=v]},useEffect:fn=>effects.push(fn)};
   if(name==='react/jsx-runtime')return{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
   if(name==='react-native')return{View:'View',Text:'Text',Pressable:'Pressable',AppState:{currentState:'active',addEventListener:()=>({remove(){}})}};
   if(name==='expo-router')return{usePathname:()=> '/',router:{push:r=>routes.push(r)}};
   if(name.includes('AuthContext'))return{useAuth:()=>({session:{user:{id:'owner'}}})};
   if(name.includes('safe-area'))return{useSafeAreaInsets:()=>({top:0})};
   if(name.includes('recovery'))return{loadRecovery:async()=>draft};
   if(name.includes('native-upload'))return{serverBatchStatus:async()=>({result:{job_id:'job-a'}})};
   if(name.includes('/api'))return{API_BASE_URL:'https://fixture.invalid',apiFetch:async()=>({ok:true,json:async()=>({success:true,status})})};
   throw Error(name);
  }});
  output.RecoveryBanner();effects[0]();await new Promise(r=>setImmediate(r));cursor=0;
  const view=output.RecoveryBanner();view.props.children.props.onPress();
  assert.equal(routes[0].params.resumeJobId,'job-a');assert.equal(routes[0].params.customerId,'customer-a');
  assert.match(state[1],status==='complete'?/Results ready/:status==='failed'?/needs attention/:/Analyzing/);
 }
 console.log('PASS: native batch resolves to correct saved job; queued, ready and failed states navigate directly to its review.');
})().catch(e=>{console.error(e);process.exitCode=1});
