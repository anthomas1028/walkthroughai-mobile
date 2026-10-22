const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync('lib/api.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
(async () => {
  for (const [path, milliseconds] of [['/api/finalize',300000],['/api/customers',30000]]) {
    let timer, fetchSignal;
    const context = {exports:{}, require:()=>({supabase:{auth:{getSession:async()=>({data:{session:{access_token:'synthetic'}}})}}}),
      Headers, AbortController, Error, setTimeout:(fn,ms)=>{timer={fn,ms};return 1;}, clearTimeout:()=>{},
      fetch:(_url,init)=>{fetchSignal=init.signal;return new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('aborted'))));}};
    vm.runInNewContext(code,context);
    const request=context.exports.apiFetch('https://example.invalid'+path);
    await new Promise(setImmediate);
    assert.equal(timer.ms,milliseconds);
    timer.fn();
    await assert.rejects(request,error=>path.endsWith('finalize')
      ? error.name==='FinalizationPendingError' && error.message.includes('History')
      : error.message.includes('connection timed out'));
    assert.equal(fetchSignal.aborted,true);
  }
  console.log('PASS: finalization has a five-minute deadline and recovery message; ordinary requests retain 30 seconds.');
})().catch(error=>{console.error(error);process.exitCode=1;});
