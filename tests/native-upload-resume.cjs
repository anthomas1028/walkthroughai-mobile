const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.createSourceFile('upload.tsx', fs.readFileSync('app/upload.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function findSubmit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'submitNativeJob') return node;
  return node.forEachChild(findSubmit);
}
const fn = ts.transpileModule(findSubmit(source).getText(source), {
  compilerOptions: { target: ts.ScriptTarget.ES2020 }
}).outputText;

async function run(expired) {
  const id = 'saved-batch';
  const received = new Set([0]);
  let now = 0, queues = 0, polls = 0;
  const sent = [];
  const context = {
    recoveryRef: { current: { nativeBatchId: id } },
    checkpoint: async snapshot => assert.equal(snapshot.nativeBatchId, id),
    uploadMounted: { current: true }, AppState: { currentState: 'active' },
    foregroundEnabled: { current: false }, foregroundTransfer: { current: null },
    preparedPhotos: [{ location: 'A' }, { location: 'B' }, { location: 'C' }],
    customer: 'Example', customerId: '', notificationToken: '', cleanText: String,
    setNativeUploadQueued() {}, setJobStatusMessage() {}, setReceivedPhotos() {}, setOfferForeground() {},
    AbortController, Date: { now: () => now }, JOB_POLL_INTERVAL_MS: 2500,
    setTimeout(fn, ms) { if (ms < 10000) { now += ms; queueMicrotask(fn); } return 1; },
    clearTimeout() {},
    enqueueNativeUpload: async batch => { assert.equal(batch, id); queues++; },
    nativeUploadStatus: async () => ({ uploaded: ['metadata', '0'], error: expired ? 'Sign in again, then resume this upload.' : undefined }),
    serverBatchStatus: async batch => {
      assert.equal(batch, id);
      assert.ok(++polls < 45, 'upload stalled');
      return received.size === 3 ? { result: { success: true, job_id: 'one-job' } } : { uploaded_slots: [...received] };
    },
    sendPhotoWhileOpen: async (batch, slot, photos, signal) => {
      assert.equal(batch, id); assert.equal(signal.aborted, false);
      assert.equal(photos.length, 3); assert.ok(!received.has(slot));
      sent.push(slot); received.add(slot);
    }
  };
  const result = await vm.runInNewContext(fn + '\nsubmitNativeJob()', context);
  assert.equal(result.data.job_id, 'one-job');
  assert.equal(queues, expired ? 2 : 1);
  assert.deepEqual(sent, [2, 1]);
}
(async () => {
  await run(true);
  await run(false);
  console.log('PASS: expired queue sign-in and stalled transfers resume missing slots on the original batch.');
})().catch(error => { console.error(error); process.exitCode = 1; });
