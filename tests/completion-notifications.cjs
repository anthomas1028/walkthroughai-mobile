const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), assert = require('node:assert/strict');
const source = ts.transpileModule(fs.readFileSync('lib/completion-notifications.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
function fixture({ variant = 'test', granted = true, canAskAgain = true, requestGrants = true, ok = true } = {}) {
  const output = {}, calls = [];
  const permissions = { granted, canAskAgain };
  const notifications = {
    getPermissionsAsync: async () => permissions,
    requestPermissionsAsync: async () => { calls.push('permission'); return { granted: requestGrants }; },
    getExpoPushTokenAsync: async () => ({ data: 'ExpoPushToken[fixture-token-123]' }),
  };
  vm.runInNewContext(source, { exports: output, require: name => {
    if (name === 'expo-constants') return { default: { executionEnvironment: 'standalone', expoConfig: { extra: { appVariant: variant, completionNotifications: variant === 'test', eas: { projectId: 'fixture-project' } } } } };
    if (name === 'react-native') return { Platform: { OS: 'ios' } };
    if (name === 'expo-notifications') return notifications;
    if (name === './api') return { API_BASE_URL: 'https://fixture.invalid', apiFetch: async (url, options) => {
      calls.push({ url, ...options }); return { ok, json: async () => ({ success: ok }) };
    } };
    throw Error(name);
  } });
  return { output, calls };
}
(async () => {
  let f = fixture({ granted: false });
  const token = await f.output.setCompletionAlert('job', true);
  assert.equal(f.calls[0], 'permission'); assert.equal(f.calls[1].method, 'POST');
  await f.output.setCompletionAlert('job', false, token);
  assert.equal(f.calls[2].method, 'DELETE');
  f = fixture({ granted: false, canAskAgain: false });
  await assert.rejects(f.output.setCompletionAlert('job', true), /Settings/); assert.equal(f.calls.length, 0);
  f = fixture({ variant: 'production' });
  assert.equal(f.output.completionAlertsSupported, false);
  await assert.rejects(f.output.setCompletionAlert('job', true), /updated test build/);
  f = fixture({ ok: false }); await assert.rejects(f.output.setCompletionAlert('job', true), /Analysis will continue/);
  console.log('PASS: explicit permission, denial, job subscription, opt-out, API failure and ordinary-build isolation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
