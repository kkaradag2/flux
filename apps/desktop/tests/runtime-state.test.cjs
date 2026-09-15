const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const ts = require('typescript');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const root = path.resolve(__dirname, '../../..');
const base = path.join(root, '.cache/runtime-state-tests', String(Date.now()));
test('Persistent Codex operational state and assisted update', async t => {
  await fs.mkdir(base, { recursive: true });
  async function compile(source, name) { await fs.writeFile(path.join(base, name + '.js'), ts.transpileModule(await fs.readFile(path.join(root, source), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText); }
  for (const name of ['CodexRuntimeStateService', 'CodexRuntimeStateRepository', 'CodexUpdateService', 'WindowsShimAdapter']) await compile('apps/desktop/src/main/runtime/' + name + '.ts', name);
  await compile('apps/desktop/src/renderer/components/settings/runtimePresentation.ts', 'runtimePresentation');
  await compile('apps/desktop/src/main/app-server/verificationReason.ts', 'verificationReason');
  const { CodexRuntimeStateService: Service } = require(path.join(base, 'CodexRuntimeStateService.js'));
  const { CodexRuntimeStateRepository: Repository, parseRuntimeState } = require(path.join(base, 'CodexRuntimeStateRepository.js'));
  const { CodexUpdateService: Updater } = require(path.join(base, 'CodexUpdateService.js'));
  const { runtimePresentation: present } = require(path.join(base, 'runtimePresentation.js'));
  const { classifyTurnError, reasonForCode } = require(path.join(base, 'verificationReason.js'));
  const { windowsShimCommand } = require(path.join(base, 'WindowsShimAdapter.js'));
  const date = () => new Date().toISOString();
  const hello = { status: 'passed', response: 'Hello from Flux.', checkedAt: date(), verificationReason: null };
  const old = { status: 'failed', response: null, checkedAt: date(), errorCode: 'RUNTIME_INCOMPATIBLE', verificationReason: 'CLI_TOO_OLD' };
  let sequence = 0;
  function fixture() {
    const calls = []; const store = new Repository(path.join(base, 'state-' + (++sequence) + '.json'));
    let health = { status: 'ready', runtime: 'codex', version: '0.151.0', authenticationMethod: 'ChatGPT', checkedAt: date() }, verification = old, updateProblem = null;
    const healthPort = { refresh: async () => { calls.push('health'); return { ...health, checkedAt: date() }; }, invalidate: () => calls.push('invalidate') };
    const verifier = { run: async () => { calls.push('verify'); return { ...verification, checkedAt: date() }; }, shutdown: async () => {} };
    const updater = { update: async () => { calls.push('update'); return updateProblem; }, shutdown: async () => {} };
    const make = () => new Service(store, healthPort, verifier, updater);
    return { calls, store, make, service: make(), healthPort, verifier, updater, setHealth: value => health = { ...health, ...value }, setVerification: value => verification = value, setUpdate: value => updateProblem = value };
  }
  await t.test('first check automatically verifies; health ready + CLI_TOO_OLD only shows Update required', async () => {
    const f = fixture(); const result = await f.service.inspect(); assert.deepEqual(f.calls, ['health', 'verify']); assert.equal(result.state.operationalStatus, 'UPDATE_REQUIRED');
    const view = present(result); assert.equal(view.label, 'Update required'); assert.equal(view.canUpdate, true); assert.equal(view.message.includes('ready'), false);
  });
  await t.test('screen transitions and process restart reuse same version/auth verification without model calls', async () => {
    const f = fixture(); const first = await f.service.inspect(); await f.service.inspect(); const second = await f.make().inspect();
    assert.equal(second.state.operationalStatus, 'UPDATE_REQUIRED'); assert.equal(second.state.verifiedAt, first.state.verifiedAt); assert.equal(f.calls.filter(x => x === 'verify').length, 1);
  });
  await t.test('successful verification persists and Ready has no actions', async () => {
    const f = fixture(); f.setVerification(hello); await f.service.inspect(); const result = await f.make().inspect();
    assert.equal(result.state.operationalStatus, 'READY'); assert.equal(present(result).label, 'Ready to use'); assert.equal(present(result).canRetry, false); assert.equal(present(result).canUpdate, false); assert.equal(f.calls.filter(x => x === 'verify').length, 1);
  });
  for (const [label, change] of [['version', { version: '0.152.0' }], ['authentication method', { authenticationMethod: 'API key' }]]) await t.test(label + ' change invalidates old verification and verifies again', async () => {
    const f = fixture(); await f.service.inspect(); f.setHealth(change); f.setVerification(hello); assert.equal((await f.service.inspect()).state.operationalStatus, 'READY'); assert.equal(f.calls.filter(x => x === 'verify').length, 2);
  });
  await t.test('missing executable and sign-out invalidate prior Ready; restored login verifies again', async () => {
    const f = fixture(); f.setVerification(hello); await f.service.inspect();
    f.setHealth({ status: 'not-installed', version: null, authenticationMethod: null }); let result = await f.service.inspect(); assert.equal(result.state.operationalStatus, 'UNAVAILABLE'); assert.equal(result.state.verificationStatus, 'unverified');
    f.setHealth({ status: 'not-authenticated', version: '0.151.0' }); result = await f.service.inspect(); assert.equal(result.state.operationalStatus, 'SIGN_IN_REQUIRED');
    f.setHealth({ status: 'ready', authenticationMethod: 'ChatGPT' }); await f.service.inspect(); assert.equal(f.calls.filter(x => x === 'verify').length, 2);
  });
  await t.test('Check again forces fresh health then verification even when version unchanged', async () => {
    const f = fixture(); await f.service.inspect(); f.calls.length = 0; f.setVerification(hello); assert.equal((await f.service.inspect(true)).state.operationalStatus, 'READY'); assert.deepEqual(f.calls, ['health', 'verify']);
  });
  await t.test('concurrent startup, Settings and retry share exactly one pipeline', async () => {
    const f = fixture(); const a = f.service.inspect(), b = f.service.inspect(), c = f.service.inspect(true); assert.equal(a, b); assert.equal(a, c); assert.equal(f.service.snapshot().activity, 'checking'); await a; assert.deepEqual(f.calls, ['health', 'verify']);
  });
  await t.test('only precise typed CLI_TOO_OLD enables update; generic incompatible does not', async () => {
    assert.equal(reasonForCode('RUNTIME_INCOMPATIBLE'), 'UNKNOWN_INCOMPATIBILITY'); assert.equal(classifyTurnError({ message: 'The selected model requires a newer version of Codex. sk-secret' }), 'CLI_TOO_OLD');
    const f = fixture(); f.setVerification({ ...old, verificationReason: undefined }); const result = await f.service.inspect(); assert.equal(result.state.operationalStatus, 'VERIFICATION_FAILED'); assert.equal(present(result).canUpdate, false);
    for (const reason of ['MODEL_UNSUPPORTED', 'PROTOCOL_UNSUPPORTED', 'UNKNOWN_INCOMPATIBILITY', 'VERIFICATION_TIMEOUT']) { f.setVerification({ ...old, verificationReason: reason }); assert.equal(present(await f.service.inspect(true)).canUpdate, false); }
  });
  await t.test('error states have contextual actions and safe text', async () => {
    const f = fixture();
    for (const [reason, status, label] of [['AUTHENTICATION_REQUIRED', 'SIGN_IN_REQUIRED', 'Check again'], ['PROCESS_UNAVAILABLE', 'UNAVAILABLE', 'Check again'], ['VERIFICATION_TIMEOUT', 'VERIFICATION_FAILED', 'Try again']]) {
      f.setVerification({ ...old, verificationReason: reason, message: 'sk-secret stdout stderr App Server' }); const result = await f.service.inspect(true); assert.equal(result.state.operationalStatus, status); const view = present(result); assert.equal(view.retryLabel, label); assert.ok(!JSON.stringify(result).includes('secret')); assert.ok(!view.message.includes('App Server'));
    }
  });
  await t.test('successful update invalidates, re-resolves through health, verifies, persists Ready in order', async () => {
    const f = fixture(); await f.service.inspect(); f.calls.length = 0;
    f.updater.update = async () => { f.calls.push('update'); f.setHealth({ version: '0.152.0' }); return null; }; f.setVerification(hello);
    const run = f.service.update(); assert.equal(present(f.service.snapshot()).label, 'Updating'); assert.equal(present(f.service.snapshot()).busy, true); const result = await run;
    assert.deepEqual(f.calls, ['update', 'invalidate', 'health', 'verify']); assert.equal(result.state.operationalStatus, 'READY'); assert.equal((await f.store.load()).cliVersion, '0.152.0');
  });
  await t.test('update failure and multiple installations persist safely without verification', async () => {
    for (const problem of ['UPDATE_FAILED', 'MULTIPLE_INSTALLATIONS', 'UNKNOWN_INSTALLATION']) { const f = fixture(); await f.service.inspect(); f.setUpdate(problem); f.calls.length = 0; const result = await f.service.update(); assert.equal(result.state.updateProblem, problem); assert.deepEqual(f.calls, ['update']); assert.equal((await f.make().inspect()).state.updateProblem, problem); }
  });
  await t.test('update with unchanged version never marks Ready or invokes verification', async () => {
    const f = fixture(); await f.service.inspect(); f.calls.length = 0; f.setVerification(hello); const result = await f.service.update(); assert.equal(result.state.operationalStatus, 'VERIFICATION_FAILED'); assert.equal(result.state.updateProblem, 'VERSION_UNCHANGED'); assert.deepEqual(f.calls, ['update', 'invalidate', 'health']); assert.equal((await f.make().inspect()).state.operationalStatus, 'VERIFICATION_FAILED');
  });
  await t.test('update is unavailable without precise CLI_TOO_OLD', async () => { const f = fixture(); f.setVerification(hello); await f.service.inspect(); f.calls.length = 0; await f.service.update(); assert.deepEqual(f.calls, []); });
  await t.test('repository strips unknown data and refuses inconsistent Ready or corrupt JSON', async () => {
    const f = fixture(); const result = await f.service.inspect(); await f.store.save({ ...result.state, stdout: 'sk-secret', executable: 'secret-path' }); assert.ok(!JSON.stringify(await f.store.load()).includes('secret'));
    assert.throws(() => parseRuntimeState({ ...result.state, operationalStatus: 'READY' })); const broken = path.join(base, 'broken.json'); await fs.writeFile(broken, '{broken'); await assert.rejects(new Repository(broken).load()); assert.equal(await fs.readFile(broken, 'utf8'), '{broken');
  });
  await t.test('Settings has no legacy controls or localStorage and uses confirmation', async () => {
    const source = await fs.readFile(path.join(root, 'apps/desktop/src/renderer/components/settings/CodexRuntimeRow.tsx'), 'utf8'); assert.ok(!source.includes('Run test')); assert.ok(!source.includes('Refresh')); assert.ok(!source.includes('localStorage'));
    const confirm = await fs.readFile(path.join(root, 'apps/desktop/src/renderer/components/settings/CodexUpdateConfirmation.tsx'), 'utf8'); assert.ok(confirm.includes('showModal')); assert.ok(confirm.includes('Current version:')); assert.ok(confirm.includes('onConfirm'));
  });
  await t.test('Windows npm shim accepts only fixed commands and rejects injected paths', () => {
    const command = windowsShimCommand('C:\\Program Files\\nodejs\\npm.cmd', 'npm-update', 'C:\\Windows'); assert.ok(command.args.at(-1).includes('install -g @openai/codex@latest')); assert.throws(() => windowsShimCommand('C:\\bad&evil\\npm.cmd', 'npm-update', 'C:\\Windows')); assert.throws(() => windowsShimCommand('C:\\codex.cmd', 'npm-update', 'C:\\Windows'));
  });
  await t.test('multiple executable installations block before npm is called', async () => {
    const updater = new Updater({ resolveAll: async () => ['codex-a', 'codex-b'], run: () => { throw new Error('must not call'); } }); assert.equal(await updater.update(), 'MULTIPLE_INSTALLATIONS');
  });
  await t.test('unknown install blocks without executing update', async () => {
    const updater = new Updater({ resolveAll: async tool => [path.join(base, tool)], run: async () => ({ stdout: base, failed: false, timedOut: false, exitCode: 0 }) }); assert.equal(await updater.update(), 'UNKNOWN_INSTALLATION');
  });
  await t.test('verified npm install runs fixed update, drains secrets, waits for close and cleans listeners', async () => {
    const prefix = path.join(base, 'npm-global'), windows = process.platform === 'win32'; const pkg = path.join(prefix, windows ? 'node_modules' : 'lib/node_modules', '@openai/codex'); await fs.mkdir(path.join(pkg, 'bin'), { recursive: true }); await fs.writeFile(path.join(pkg, 'package.json'), JSON.stringify({ name: '@openai/codex', bin: { codex: 'bin/codex.js' } })); await fs.writeFile(path.join(pkg, 'bin/codex.js'), '');
    const codex = windows ? path.join(prefix, 'codex.cmd') : path.join(pkg, 'bin/codex.js'); if (windows) await fs.writeFile(codex, 'node_modules\\@openai\\codex\\bin\\codex.js');
    const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); const calls = [];
    const updater = new Updater({ resolveAll: async tool => [tool === 'codex' ? codex : path.join(prefix, windows ? 'npm.cmd' : 'npm')], run: async (executable, command) => { calls.push(command); return { stdout: prefix + '\n', exitCode: 0, failed: false, timedOut: false }; }, start: (executable, command) => { calls.push(command); setImmediate(() => { child.stdout.write('sk-secret'); child.stderr.write('sk-private'); child.emit('close', 0); }); return child; } });
    assert.equal(await updater.update(), null); assert.deepEqual(calls, ['npm-prefix', 'npm-update']); assert.equal(child.listenerCount('close'), 0); assert.equal(child.listenerCount('error'), 0); assert.equal(child.stdout.listenerCount('data'), 0); assert.ok(child.stdout.destroyed && child.stderr.destroyed && child.stdin.destroyed);
  });
});
