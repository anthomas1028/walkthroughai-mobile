const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const calls=[];let params={};let hasHistory=false;const moduleResult={exports:{}};
const source=fs.readFileSync(path.join(__dirname,'../lib/back-navigation.ts'),'utf8');
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:moduleResult.exports,require:()=>({router:{canGoBack:()=>hasHistory,back:()=>calls.push("BACK"),replace:href=>calls.push(href)},useLocalSearchParams:()=>params})});
const {backDestination,useBackTo}=moduleResult.exports;
for(const [parent,expected] of [['home','/'],['account','/account'],['customer','/customer-dashboard'],['history','/history'],['capture','/walkthrough']]){
 params={customerId:['13'],customerName:'Jasper Products',readOnly:'true',contactName:'Sample contact'};
 useBackTo(parent)();const result=calls.pop();assert.equal(typeof result==='string'?result:result.pathname,expected);
 if(typeof result!=='string'){assert.equal(result.params.customerId,'13');assert.equal(result.params.readOnly,'true');}
}
for(const id of [undefined,'','0','not-an-id','-1']) assert.equal(backDestination('customer',{customerId:id}),'/');
params={};useBackTo('history')({customerId:13,customerName:'Jasper Products'});assert.equal(calls.pop().pathname,'/history');
const screens=fs.readdirSync(path.join(__dirname,'../app')).filter(n=>n.endsWith('.tsx'));
for(const screen of screens)assert.ok(!/router\.back\(/.test(fs.readFileSync(path.join(__dirname,'../app',screen),'utf8')),`${screen} bypasses the shared back navigation`);
console.log('Back destinations, direct-entry fallback, customer context and all-screen coverage passed.');

hasHistory=true;useBackTo("customer")();assert.equal(calls.pop(),"BACK");

assert.equal(backDestination('capture',{teamSessionId:'shared-visit'}).pathname,'/shared');
assert.equal(backDestination('capture',{teamSessionId:'shared-visit'}).params.visitId,'shared-visit');
