const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const output = path.join(root, '.cache/single-agent-tests', String(Date.now()));
test('Single-agent read-only chat', async t => {
  for (const directory of ['main/app-server', 'main/chat', 'main/management', 'main/projects', 'shared']) {
    const source = path.join(root, 'apps/desktop/src', directory);
    await fs.mkdir(path.join(output, directory), { recursive: true });
    for (const file of await fs.readdir(source)) {
      if (!file.endsWith('.ts') || file.startsWith('register')) continue;
      const code = ts.transpileModule(await fs.readFile(path.join(source, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
      await fs.writeFile(path.join(output, directory, file.replace(/\.ts$/, '.js')), code);
    }
  }
  const { CodexAppServerTransport } = require(path.join(output, 'main/app-server/CodexAppServerTransport'));
  const { CodexAppServerClient } = require(path.join(output, 'main/app-server/CodexAppServerClient'));
  const { SingleAgentRunService, singleAgentInput } = require(path.join(output, 'main/chat/SingleAgentRunService'));
  const options = { cwd: root, instructions: 'Saved Lead instructions', runtime: { type: 'codex', model: null, reasoningEffort: 'default' } };
  const input = { projectId: 'flux', branch: 'main', teamId: 'core-team', prompt: 'Hello' };
  const tick = () => new Promise(resolve => setImmediate(resolve));
  const until = async check => { for (let i = 0; i < 1000; i++) { if (check()) return; await new Promise(r => setTimeout(r, 5)); } assert.fail('condition timed out'); };
  const fixtures = [];
  function fixture(mode = 'success') {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    let turns = 0, killed = 0; const sent = [];
    const send = value => { if (!child.stdout.destroyed) child.stdout.write(JSON.stringify(value) + '\n'); };
    const terminal = (id, status = 'completed') => send({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id, status, items: [], error: { message: 'sk-secret raw error' } } } });
    child.stdin = new Writable({ write(chunk, _encoding, callback) {
      const message = JSON.parse(chunk.toString()); sent.push(message); callback();
      queueMicrotask(() => {
        if (message.method === 'initialize') {
          if (mode === 'malformed') { child.stdout.write('sk-secret bad JSON\n'); return; }
          if (mode === 'exit') { child.emit('close', 1); return; }
          if (mode === 'startup-timeout') return;
          send({ id: message.id, result: { userAgent: 'codex-cli 0.154.0' } });
        }
        if (message.method === 'thread/start') send({ id: message.id, result: { thread: { id: 'thread-1' }, approvalPolicy: 'never', sandbox: { type: 'readOnly', networkAccess: false } } });
        if (message.method === 'mcpServerStatus/list') {
          const inherited = [{ name: 'normal', pluginId: null, tools: { tool: {} } }, { name: 'bundled', pluginId: 'plugin@fixture', tools: { tool: {} } }, { name: 'codex_apps', pluginId: null, tools: { tool: {} } }];
          const data = mode === 'external-tools' ? [{ name: 'external', pluginId: 'external@fixture', tools: { unsafeTool: {} } }] : mode === 'inherited-tools' ? (message.params.threadId ? [{ name: 'normal', runtimeStatus: 'disabled', tools: {} }] : inherited) : [];
          send({ id: message.id, result: { data, nextCursor: null } });
        }
        if (message.method === 'turn/start') {
          const id = 'turn-' + (++turns);
          send({ id: message.id, result: { turn: { id } } });
          if (mode === 'hold') return;
          if (mode === 'approval') { send({ id: 99, method: 'item/commandExecution/requestApproval', params: {} }); terminal(id); return; }
          if (mode === 'failed') { terminal(id, 'failed'); return; }
          const event = { method: 'item/agentMessage/delta', params: { threadId: 'thread-1', turnId: id, itemId: 'answer-' + id, delta: 'Hello from Lead.' } };
          const bytes = Buffer.from(JSON.stringify(event) + '\n'); child.stdout.write(bytes.subarray(0, 21)); child.stdout.write(bytes.subarray(21));
          send({ method: 'item/completed', params: { threadId: 'thread-1', turnId: id, item: { id: 'answer-' + id, type: 'agentMessage', text: 'Hello from Lead.', phase: 'final_answer' } } });
          terminal(id);
        }
        if (message.method === 'turn/interrupt') { send({ id: message.id, result: {} }); terminal(message.params.turnId, 'interrupted'); }
      });
    } });
    const wire = new CodexAppServerTransport(child, async () => { killed++; child.emit('close', 0); });
    const client = new CodexAppServerClient(async () => wire);
    const result = { wire, client, child, sent, killed: () => killed }; fixtures.push(result); return result;
  }
  function service(mode = 'success', changes = {}) {
    const f = fixture(mode), events = []; let launches = 0;
    const agents = [{ id: 'lead', name: 'Lead', avatar: { type: 'builtin', value: 'robot' }, enabled: true, runtime: options.runtime, instructionsMarkdown: options.instructions }, { id: 'developer', name: 'Developer', enabled: true, runtime: options.runtime, instructionsMarkdown: 'Do not use' }];
    const snapshot = { activity: null, state: { operationalStatus: 'READY', verificationStatus: 'passed', installationId: 'selected', cliVersion: '0.154.0' } };
    const projects = { getProjects: async () => [{ id: 'flux', path: root }], getCurrentBranch: async () => changes.branch ?? 'main' };
    const records = new Map(); const repository = { save: async value => { records.set(value.id, structuredClone(value)); }, get: async id => { if (!records.has(id)) throw Error('missing'); return structuredClone(records.get(id)); }, list: async () => [...records.values()].map(v => structuredClone(v)) };
    const instance = new SingleAgentRunService(projects, { getAgents: async () => changes.agents ?? agents }, { getTeam: async id => ({ id, agentIds: ['lead', 'developer'] }) }, { snapshot: () => changes.snapshot ?? snapshot }, () => { launches++; return (launches === 1 ? f : fixture(mode)).client.createChatSession(); }, repository, { inspect: async () => true, ensure: async (record, _project, save) => { if (changes.worktreeError) throw new (require(path.join(output, 'main/chat/ConversationWorktreeService')).WorktreeError)(changes.worktreeError); record.baseBranch = record.branchName; record.workBranch = 'flux/test'; record.worktreePath = path.join(root, '.cache/mock-worktree'); record.worktreeStatus = 'ready'; record.worktreeCreatedAt = new Date().toISOString(); await save(); return record.worktreePath; } }, changes.timeout ?? 1000);
    return { ...f, instance, events, launches: () => launches, send: (data = input) => instance.start(1, data, e => events.push(e)), finished: async () => until(() => events.some(e => ['completed', 'failed', 'cancelled'].includes(e.type))) };
  }
  await t.test('accepts only the four renderer fields, rejects injected execution settings and blank prompts', () => {
    assert.deepEqual(singleAgentInput(input), input);
    for (const key of ['cwd', 'path', 'instructions', 'model', 'executable', 'conversationId']) assert.throws(() => singleAgentInput({ ...input, [key]: 'injected' }), /Choose/);
    for (const prompt of ['', '  ', '\0', 'x'.repeat(32001)]) assert.throws(() => singleAgentInput({ ...input, prompt }));
  });
  await t.test('streams first enabled Lead using saved instructions; handshake, read-only/no-network and defaults', async () => {
    const f = service(); const identity = f.send(); await f.finished();
    assert.deepEqual(f.events.map(e => e.type), ['started', 'messageDelta', 'messageDelta', 'completed']);
    assert.ok(f.events.every(e => e.conversationId === identity.conversationId && e.runId === identity.runId));
    assert.equal(f.events[0].agent.name, 'Lead'); assert.equal(f.events.at(-1).text, 'Hello from Lead.');
    assert.deepEqual(f.sent.filter(e => e.method).map(e => e.method), ['initialize', 'initialized', 'mcpServerStatus/list', 'thread/start', 'mcpServerStatus/list', 'turn/start']);
    const thread = f.sent.find(e => e.method === 'thread/start').params, turn = f.sent.find(e => e.method === 'turn/start').params;
    assert.equal(thread.developerInstructions, options.instructions); assert.equal(thread.cwd, path.join(root, '.cache/mock-worktree')); assert.equal(turn.cwd, thread.cwd); assert.equal(thread.ephemeral, false);
    assert.equal(thread.sandbox, 'read-only'); assert.equal(thread.approvalPolicy, 'never');
    assert.equal(thread.config['features.multi_agent'], false); assert.equal(thread.config['features.apps'], false); assert.equal(thread.config.web_search, 'disabled'); assert.deepEqual(thread.config.mcp_servers, {});
    assert.deepEqual(turn.sandboxPolicy, { type: 'readOnly', networkAccess: false }); assert.equal(turn.approvalPolicy, 'never');
    assert.ok(!('model' in thread) && !('effort' in turn)); assert.equal(f.launches(), 1);
    await f.instance.shutdown();
  });
  await t.test('follow-up reuses thread and process; new task creates another conversation', async () => {
    const f = service(); const first = f.send(); await f.finished(); f.events.length = 0;
    const second = f.send({ ...input, prompt: 'Follow-up' }); await f.finished();
    assert.equal(first.conversationId, second.conversationId); assert.notEqual(first.runId, second.runId);
    assert.equal(f.sent.filter(e => e.method === 'thread/start').length, 1);
    assert.deepEqual(f.sent.filter(e => e.method === 'turn/start').map(e => e.params.threadId), ['thread-1', 'thread-1']);
    await f.instance.reset(1); assert.equal(f.killed(), 1);
    f.events.length = 0; const third = f.send(); assert.notEqual(third.conversationId, first.conversationId); await f.finished(); assert.equal(f.events.at(-1).type, 'completed'); await f.instance.shutdown();
  });
  await t.test('inherited servers, plugin tools and apps are disabled only for the new thread', async () => {
    const f = service('inherited-tools'); f.send(); await f.finished();
    const config = f.sent.find(e => e.method === 'thread/start').params.config;
    assert.deepEqual(config.mcp_servers, { normal: { enabled: false } });
    assert.deepEqual(config.plugins, { 'plugin@fixture': { enabled: false } });
    assert.equal(f.events.at(-1).type, 'completed'); await f.instance.shutdown();
  });
  await t.test('disabled first member is skipped and only the first enabled member runs', async () => {
    const f = service('success', { agents: [{ id: 'lead', enabled: false }, { id: 'developer', name: 'Developer', avatar: { type: 'builtin', value: 'code' }, enabled: true, runtime: options.runtime, instructionsMarkdown: 'Saved developer instructions' }] });
    f.send(); await f.finished(); assert.equal(f.events[0].agent.id, 'developer'); assert.equal(f.launches(), 1);
    assert.equal(f.sent.find(e => e.method === 'thread/start').params.developerInstructions, 'Saved developer instructions'); await f.instance.shutdown();
  });
  await t.test('explicit model and effort sent from saved agent definition', async () => {
    const f = fixture(); const session = f.client.createChatSession();
    await session.turn({ ...options, runtime: { ...options.runtime, model: 'chosen-model', reasoningEffort: 'high' } }, 'Hi', new AbortController().signal, () => {});
    assert.equal(f.sent.find(e => e.method === 'thread/start').params.model, 'chosen-model');
    assert.equal(f.sent.find(e => e.method === 'turn/start').params.effort, 'high'); await session.close();
  });
  for (const [name, changes, code] of [
    ['missing base branch', { worktreeError: 'BASE_BRANCH_UNAVAILABLE' }, 'BASE_BRANCH_UNAVAILABLE'],
    ['missing isolated tree', { worktreeError: 'WORKTREE_MISSING' }, 'WORKTREE_MISSING'],
    ['no enabled agent', { agents: [] }, 'AGENT_UNAVAILABLE'],
    ['runtime not ready', { snapshot: { activity: null, state: { operationalStatus: 'UNAVAILABLE' } } }, 'RUNTIME_NOT_READY'],
  ]) await t.test(name + ' blocks process launch safely', async () => {
    const f = service('success', changes); f.send(); await f.finished();
    assert.equal(f.events.at(-1).code, code); assert.equal(f.launches(), 0); assert.equal(f.sent.length, 0);
    await f.wire.close(); await f.instance.shutdown();
  });
  await t.test('Stop interrupts actual turn; foreign window cannot cancel; no simultaneous turns', async () => {
    const f = service('hold'); f.send(); await until(() => f.sent.some(e => e.method === 'turn/start'));
    assert.throws(() => f.send(), /already running/); await f.instance.cancel(2); assert.ok(!f.sent.some(e => e.method === 'turn/interrupt'));
    await f.instance.cancel(1); assert.equal(f.events.at(-1).type, 'cancelled');
    assert.deepEqual(f.sent.find(e => e.method === 'turn/interrupt').params, { threadId: 'thread-1', turnId: 'turn-1' });
    assert.equal(f.killed(), 0); assert.equal(f.wire.notifications.size, 0); assert.equal(f.wire.requests.size, 0);
    await f.instance.shutdown(); assert.equal(f.killed(), 1);
  });
  for (const mode of ['malformed', 'exit', 'failed', 'approval', 'startup-timeout', 'external-tools']) await t.test(mode + ' safely fails and cleans up without raw outputs', async () => {
    const f = service(mode, { timeout: 30 }); f.child.stderr.write('sk-secret'); f.send(); await f.finished();
    assert.equal(f.events.at(-1).type, 'failed'); assert.ok(!JSON.stringify(f.events).includes('sk-secret'));
    if (mode === 'approval') assert.deepEqual(f.sent.find(e => e.id === 99).result, { decision: 'decline' });
    if (mode === 'external-tools') assert.ok(!f.sent.some(e => e.method === 'turn/start'));
    assert.equal(f.killed(), 1); await f.instance.shutdown();
  });
  await t.test('changing context cannot reuse a different project/team/agent thread', async () => {
    const f = service(); f.send(); await f.finished(); f.events.length = 0; f.send({ ...input, teamId: 'other-team' }); await f.finished();
    assert.equal(f.events.at(-1).code, 'CONTEXT_CHANGED');
    assert.equal(f.sent.filter(e => e.method === 'thread/start').length, 1); await f.instance.shutdown();
  });
  await t.test('all closed sessions remove child and protocol listeners', async () => {
    await tick();
    for (const f of fixtures) {
      assert.equal(f.killed(), 1); assert.equal(f.child.listenerCount('close'), 0); assert.equal(f.child.stdout.listenerCount('data'), 0);
      assert.equal(f.child.stderr.listenerCount('data'), 0); assert.equal(f.child.stdin.listenerCount('error'), 0);
      assert.equal(f.wire.pending.size, 0); assert.equal(f.wire.notifications.size, 0);
    }
  });
});
