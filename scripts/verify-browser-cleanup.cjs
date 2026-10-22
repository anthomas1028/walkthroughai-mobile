const fs=require('fs');const vm=require('vm');const ts=require('typescript');const assert=require('node:assert/strict');
function load(file,stubs,extras={}){const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;const exports={};vm.runInNewContext(source,{exports,require:n=>{if(n in stubs)return stubs[n];throw Error(n)},setTimeout,clearTimeout,Map,Promise,...extras});return exports;}
const jsx=(type,props)=>({type,props});const state={useState:()=>[0,()=>{}],useEffect:()=>{}};
let nativeCalls=0;let actions=[];
const alerts=load('lib/alerts.tsx',{'react':state,'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':{Platform:{OS:'web'},Alert:{alert:()=>nativeCalls++},Modal:'Modal',View:'View',Pressable:'Pressable',Text:'Text'}});
alerts.Alert.alert('Confirm','Keep or delete?',[{text:'Cancel',style:'cancel',onPress:()=>actions.push('cancel')},{text:'Delete',style:'destructive',onPress:()=>actions.push('delete')},{text:'Inspect',onPress:()=>actions.push('inspect')}]);
assert.deepEqual(actions,[]);assert.equal(nativeCalls,0);
function buttons(node,out=[]){if(!node||typeof node!=='object')return out;if(node.type==='Pressable')out.push(node);const c=node.props?.children;(Array.isArray(c)?c:[c]).flat().forEach(x=>buttons(x,out));return out;}
const btns=buttons(alerts.AlertHost());assert.equal(btns.length,3);btns[0].props.onPress();assert.deepEqual(actions,['cancel']);
alerts.Alert.alert('Next','Delete?',[{text:'Delete',onPress:()=>actions.push('delete')}]);buttons(alerts.AlertHost())[0].props.onPress();assert.deepEqual(actions,['cancel','delete']);
let clicked=false,removed=false,revoked=false;
const download=load('lib/download.ts',{'react-native':{Platform:{OS:'web'}}},{fetch:async()=>({ok:true,blob:async()=>({})}),URL:{createObjectURL:()=> 'blob:test',revokeObjectURL:()=>{revoked=true}},document:{createElement:()=>({click(){clicked=true},remove(){removed=true}}),body:{appendChild(){}}},setTimeout:fn=>{fn();return 0}});
(async()=>{assert.equal(await download.downloadInBrowser('https://example.test/report','report.xlsx'),true);assert.ok(clicked&&removed&&revoked);
const bad=load('lib/download.ts',{'react-native':{Platform:{OS:'web'}}},{fetch:async()=>({ok:false})});await assert.rejects(()=>bad.downloadInBrowser('https://example.test/expired','x.xlsx'),/expired/);
const native=load('lib/download.ts',{'react-native':{Platform:{OS:'ios'}}});assert.equal(await native.downloadInBrowser('https://example.test/report','report.xlsx'),false);
console.log('PASS: browser confirmation callbacks, cancel isolation, queued dialogs, browser downloads, failed-download feedback, native download fallback.');})().catch(e=>{console.error(e);process.exitCode=1});
