const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
function render(attempt,respond){
 let stateIndex=0;const checkpoints=[],calls=[];let done;const completed=new Promise(resolve=>done=resolve);
 const jsx=(type,props)=>({type,props});const exports={};
 const stubs={react:{useState:initial=>[stateIndex++===0?true:initial,()=>{}],useEffect:()=>{},useRef:value=>({current:value})},
 'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':{ActivityIndicator:'Spinner',Image:'Image',Platform:{OS:'ios'},Pressable:'Button',Text:'Text',View:'View'},
 'expo-image-picker':{},'expo-image-manipulator':{},'../lib/recovery':{},'../lib/label-retake':{retakeChanges:()=>[]},
 '../lib/api':{API_BASE_URL:'https://synthetic.invalid',apiFetch:async(url,init)=>{calls.push({url,init});return {ok:true,json:async()=>respond(url)}}}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/LabelRetakePanel.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:name=>{if(name in stubs)return stubs[name];throw Error(name)},Date,Error,FormData,Promise,setTimeout});
 const tree=exports.LabelRetakePanel({original:{part_number:'employee correction'},attempt,customer:'Synthetic',customerId:'7',location:'Bin A',onAttempt:async value=>checkpoints.push({...value}),onApply:()=>{throw Error('Must not auto-apply')},onBusy:busy=>{if(!busy)done()}});
 const buttons=[];function walk(node){if(!node||typeof node!=='object')return;if(node.type==='Button')buttons.push(node);const children=node.props?.children;(Array.isArray(children)?children:[children]).flat().forEach(walk)}walk(tree);
 return {calls,checkpoints,completed,start:()=>buttons[2].props.onPress()};
}
(async()=>{
 const recovered=render({uri:'file:closeup',uploadId:'saved-upload'},url=>url.endsWith('/saved-upload')?{result:{job_id:'saved-child'},uploaded_slots:[0]}:{status:'complete',results:[{part_number:'000123'}]});
 recovered.start();await recovered.completed;
 assert.equal(recovered.calls.length,2);assert(recovered.calls.every(call=>!call.init?.method));
 assert.equal(recovered.checkpoints.at(-1).jobId,'saved-child');assert.equal(recovered.checkpoints.at(-1).candidates[0].part_number,'000123');
 const failed=render({uri:'file:closeup',jobId:'failed-child'},()=>({status:'failed'}));failed.start();await failed.completed;
 assert.equal(failed.calls.length,1);assert.equal(failed.checkpoints.at(-1).jobId,'failed-child');assert.match(failed.checkpoints.at(-1).error,/failed/);
 console.log('PASS: lost-submit-response recovery polls the existing child only; no duplicate upload/analysis, no auto-apply; failed close-up retains resumable evidence.');
})().catch(error=>{console.error(error);process.exitCode=1});
