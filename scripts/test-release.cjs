const { spawnSync } = require("node:child_process");
const action = process.argv[2];
const message = process.argv.slice(3).join(" ");
if (!['build', 'update'].includes(action) || (action === 'update' && !message)) {
  console.error('Use npm run test:build:ios, or npm run test:update -- "Describe the change".');
  process.exit(1);
}
const args = action === 'build'
  ? ['build', '--platform', 'ios', '--profile', 'test']
  : ['update', '--platform', 'ios', '--channel', 'testing', '--environment', 'preview', '--message', message];
const result = spawnSync('npx', ['--yes', 'eas-cli@25.3.0', ...args], {
  cwd: require('node:path').resolve(__dirname, '..'),
  stdio: 'inherit',
  env: { ...process.env, APP_VARIANT: 'test' },
});
process.exit(result.status ?? 1);
