const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');

test('Main orchestration composition and IPC boundary', async t => {
  const parent = path.join(root, '.cache/orchestration-main-tests'); await fs.mkdir(parent, { recursive: true });
  const base = await fs.mkdtemp(path.join(parent, 'run-'));
  async function remove(directory) {
    const relative = path.relative(parent, path.resolve(directory)); assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    await fs.rm(directory, { recursive: true, force: true });
  }
  t.after(() => remove(base));
  async function compile(directory) {
    await fs.mkdir(path.join(base, directory), { recursive: true });
    for (const item of await fs.readdir(path.join(root, 'apps/desktop/src', directory), { withFileTypes: true })) {
      if (item.isDirectory()) { await compile(path.join(directory, item.name)); continue; }
      if (!item.name.endsWith('.ts') || item.name.endsWith('.d.ts')) continue;
      const source = await fs.readFile(path.join(root, 'apps/desktop/src', directory, item.name), 'utf8');
      await fs.writeFile(path.join(base, directory, item.name.replace(/\.ts$/, '.js')), ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      }).outputText);
    }
  }
  for (const directory of ['main', 'application', 'domain', 'shared', 'preload']) await compile(directory);
  const load = file => require(path.join(base, file));
  const { composeOrchestration } = load('main/orchestration/composeOrchestration');
  const { JsonOrchestrationRepository } = load('main/orchestration/JsonOrchestrationRepository');
  const { recoverPlanningRuns } = load('application/orchestration/recoverPlanningRuns');
  const { createTeamRun, applyOrchestrationCommand } = load('domain/orchestration');
  const { orchestrationChannels: channels } = load('shared/orchestration-channels');
  const { createOrchestrationApi } = load('preload/orchestrationApi');
  const { orchestrationError, OrchestrationBoundaryError } = load('main/orchestration/OrchestrationBoundaryError');
  const { TeamPromptError } = load('application/orchestration/TeamPromptError');
  const now = '2026-09-15T14:00:00.000Z';
  const task = (key, dependsOn = []) => ({ key, title: key, description: 'Implement ' + key, ownerAgentId: 'developer', dependsOn, acceptanceCriteria: ['Works']});
  const ask = { type: 'ask_user', message: 'Please clarify', questions: ['Which format?'], planSummary: '', tasks: [] };
  const plan = { type: 'create_plan', message: 'Plan ready', questions: [], planSummary: 'Build then verify', tasks: [task('build'), task('verify', ['build'])] };
  const respond = { type: 'respond', message: 'Answer', questions: [], planSummary: '', tasks: [] };
  class Ipc extends EventEmitter {
    handlers = new Map(); handle(channel, listener) { this.handlers.set(channel, listener); } removeHandler(channel) { this.handlers.delete(channel); }
  }
  class Contents extends EventEmitter {
    id = 1; mainFrame = {}; destroyed = false; sent = [];
    isDestroyed() { return this.destroyed; } send(channel, data) { this.sent.push({ channel, data }); }
    destroy() { this.destroyed = true; this.emit('destroyed'); }
  }
  async function fixture(t, beforeCompose) {
    const directory = await fs.mkdtemp(path.join(base, 'case-')); t.after(() => remove(directory));
    const userData = path.join(directory, 'app-data'), projectPath = path.join(directory, 'project');
    await fs.mkdir(userData); await fs.mkdir(projectPath);
    const conversationId = randomUUID();
    const agents = ['lead', 'developer'].map(id => ({ id, name: id === 'lead' ? 'Lead' : 'Developer', description: id,
      avatar: { type: 'builtin', value: 'robot' }, instructionsMarkdown: 'SECRET_INSTRUCTION_' + id, enabled: true,
      runtime: { type: 'codex', model: null, reasoningEffort: 'default' }, createdAt: now, updatedAt: now }));
    const data = { project: { id: 'project', path: projectPath, name: 'Flux', selectedBranch: 'main', createdAt: now, lastOpenedAt: now },
      conversation: { id: conversationId, projectId: 'project', branchName: 'main', codexThreadId: 'SECRET_CHAT_SESSION' },
      team: { id: 'team', name: 'Core Team', description: '', agentIds: ['lead', 'developer'], organizerAgentId: 'lead', createdAt: now, updatedAt: now },
      agents, branches: ['main', 'feature'], selected: 'project', ready: true };
    const ipc = new Ipc(), contents = new Contents(), trusted = new Set([contents.id]);
    const calls = []; let decision = respond, turnNumber = 0, closed = 0;
    const options = { app: { getPath: name => { assert.equal(name, 'userData'); return userData; } }, ipc, trusted, projectRoot: projectPath,
      projects: { getProjects: async () => data.project ? [data.project] : [], getSelectedProjectId: async () => data.selected,
        getGitBranches: async directory => { assert.equal(directory, projectPath); return data.branches; } },
      conversations: { get: async id => { if (!data.conversation || id !== data.conversation.id) throw new Error('SECRET_PATH conversation missing'); return data.conversation; } },
      agents: { getAgents: async () => data.agents }, teams: { getTeam: async id => {
        if (!data.team || data.team.id !== id) { const { ManagementError } = load('main/management/ManagementError'); throw new ManagementError('NOT_FOUND', 'SECRET_TEAM'); }
        return data.team;
      } }, runtime: { snapshot: () => ({ activity: null, state: { operationalStatus: data.ready ? 'READY' : 'UNAVAILABLE', verificationStatus: data.ready ? 'passed' : 'failed' } }) },
      installations: { resolve: async () => { throw new Error('Must not resolve a real executable'); } } };
    const runtimeSource = { resolve: async () => ({ structuredOutput: true, client: { createStructuredSession: () => ({
      turn: async (options, prompt, signal) => {
        const id = options.threadId ?? 'SECRET_RUNTIME_SESSION_' + (++turnNumber);
        calls.push({ options, prompt, signal, id }); await options.onThread(id);
        return typeof decision === 'function' ? decision(options, prompt, signal) : JSON.stringify(decision);
      }, close: async () => { closed++; },
    }) } }) };
    const location = { userDataDirectory: userData, excludedDirectories: [projectPath] }, repository = new JsonOrchestrationRepository(location);
    if (beforeCompose) await beforeCompose({ repository, conversationId, data, options });
    const composition = await composeOrchestration(options, runtimeSource);
    t.after(() => composition.shutdown());
    const event = () => ({ sender: contents, senderFrame: contents.mainFrame });
    const invoke = (channel, ...args) => ipc.handlers.get(channel)(event(), ...args);
    const request = { conversationId, projectId: 'project', branch: 'main', teamId: 'team', message: 'Please plan the request.' };
    return { directory, userData, projectPath, options, data, ipc, contents, trusted, calls, repository, location, composition, request, invoke, event,
      choose: value => { decision = value; }, closed: () => closed,
      subscribe: () => ipc.emit(channels.subscribe, event(), true) };
  }
  await t.test('composition wires real coordinator, executor, router and adapter; DTO notifications stay safe', async t => {
    const f = await fixture(t); f.choose(plan); f.subscribe(); f.subscribe();
    const response = await f.invoke(channels.start, f.request); assert.equal(response.ok, true); assert.equal(response.value.type, 'plan_created');
    const view = response.value.view; assert.equal(view.plan.version, 1); assert.deepEqual(view.tasks.map(task => task.status), ['ready', 'planned']);
    assert.equal(view.tasks[1].dependencySummary, 'Waiting for 1 task'); assert.equal(view.run.organizerName, 'Lead');
    const saved = await f.repository.rehydrate(view.run.id); assert.equal(saved.state.run.organizerSession.externalSessionId, f.calls[0].id);
    assert.equal(f.calls[0].options.cwd, f.projectPath); assert.match(f.calls[0].options.instructions, /SECRET_INSTRUCTION_lead/);
    assert.doesNotMatch(f.calls[0].options.instructions, /SECRET_INSTRUCTION_developer/);
    assert.deepEqual(f.contents.sent.map(e => e.data.view.run.status), ['planning', 'planning', 'running']);
    const rendered = JSON.stringify([response, f.contents.sent]); assert.ok(!rendered.includes('SECRET')); assert.ok(!rendered.includes(f.projectPath));
    assert.ok(!rendered.includes('externalSessionId')); assert.ok(!rendered.includes('instructions')); assert.ok(!rendered.includes('events'));
    assert.equal(typeof view.run.createdAt, 'string'); assert.equal(new Date(view.run.createdAt).toISOString(), view.run.createdAt);
    const read = await f.invoke(channels.get, f.request.conversationId); assert.deepEqual(read.value, view);
    assert.equal((await fs.readdir(path.join(f.userData, 'orchestration'))).length, 1); assert.deepEqual(await fs.readdir(f.projectPath), []); assert.equal(f.closed(), 1);
  });
  for (const key of ['path', 'executable', 'organizerAgentId', 'assignees', 'runtime']) await t.test('rejects renderer-supplied ' + key, async t => {
    const f = await fixture(t); const result = await f.invoke(channels.start, { ...f.request, [key]: 'SECRET_ATTACK' });
    assert.equal(result.ok, false); assert.equal(result.error.code, 'ORCHESTRATION_FAILED'); assert.equal(f.calls.length, 0);
  });
  for (const [name, mutate, code] of [
    ['mismatch', f => f.data.conversation.projectId = 'another', 'CONVERSATION_PROJECT_MISMATCH'],
    ['missing conversation', f => f.data.conversation = null, 'CONVERSATION_NOT_FOUND'],
    ['missing project', f => f.data.project = null, 'PROJECT_NOT_FOUND'],
    ['missing branch', f => f.data.branches = ['other'], 'BRANCH_NOT_FOUND'],
    ['missing team', f => f.data.team = null, 'TEAM_NOT_FOUND'],
    ['one member', f => f.data.team.agentIds = ['lead'], 'TEAM_NOT_RUNNABLE'],
    ['unknown member', f => f.data.team.agentIds.push('missing'), 'TEAM_NOT_RUNNABLE'],
    ['duplicate member', f => f.data.team.agentIds = ['lead', 'lead'], 'TEAM_NOT_RUNNABLE'],
    ['missing Organizer', f => f.data.team.organizerAgentId = null, 'ORGANIZER_NOT_AVAILABLE'],
    ['disabled Organizer', f => f.data.agents[0].enabled = false, 'ORGANIZER_NOT_AVAILABLE'],
    ['unsupported runtime', f => f.data.agents[0].runtime.type = 'claude', 'RUNTIME_NOT_READY'],
    ['runtime not ready', f => f.data.ready = false, 'RUNTIME_NOT_READY'],
  ]) await t.test(name + ' rejected before model execution', async t => {
    const f = await fixture(t); mutate(f); const result = await f.invoke(channels.start, f.request);
    assert.equal(result.ok, false); assert.equal(result.error.code, code); assert.equal(f.calls.length, 0); assert.ok(!JSON.stringify(result).includes('SECRET'));
  });
  await t.test('continue uses persisted session and trusted conversation; rejects session payload', async t => {
    const f = await fixture(t); f.choose(ask); f.subscribe(); const first = await f.invoke(channels.start, f.request);
    assert.equal(first.value.type, 'ask_user'); assert.deepEqual(first.value.questions, ask.questions);
    const bad = await f.invoke(channels.continue, { runId: first.value.runId, message: 'Answer', sessionId: 'injected' }); assert.equal(bad.ok, false);
    f.choose(plan); const next = await f.invoke(channels.continue, { runId: first.value.runId, message: 'Use the default.' });
    assert.equal(next.ok, true); assert.equal(next.value.view.plan.version, 1); assert.equal(f.calls.length, 2);
    assert.equal(f.calls[1].options.threadId, f.calls[0].id); assert.equal(f.calls[1].options.cwd, f.projectPath);
    const repeated = await f.invoke(channels.continue, { runId: first.value.runId, message: 'Again' }); assert.equal(repeated.error.code, 'RUN_NOT_WAITING_INPUT');
    const missing = await f.invoke(channels.continue, { runId: 'missing', message: 'Again' }); assert.equal(missing.error.code, 'RUN_NOT_FOUND');
  });
  await t.test('busy calls do not duplicate model calls; closing owner cancels and removes listeners', async t => {
    const f = await fixture(t); f.subscribe();
    let enter; const started = new Promise(resolve => enter = resolve);
    f.choose(async (_options, _prompt, signal) => { enter(); return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('SECRET_ABORT')), { once: true })); });
    const pending = f.invoke(channels.start, f.request); await started;
    const repeated = await f.invoke(channels.start, f.request); assert.equal(repeated.error.code, 'ORCHESTRATION_BUSY');
    f.contents.destroy(); const result = await pending; assert.equal(result.ok, false); assert.equal(f.calls.length, 1);
    assert.equal(f.contents.listenerCount('destroyed'), 0); assert.equal(f.contents.listenerCount('render-process-gone'), 0); assert.equal(f.contents.listenerCount('did-start-navigation'), 0);
    const run = (await f.repository.listAllRuns())[0]; assert.equal(run.status, 'cancelled'); assert.equal(f.closed(), 1);
    assert.equal(f.contents.sent.length, 2, 'closed window receives no terminal event');
  });
  await t.test('unsubscribe removes publisher listener and dead/untrusted frames receive nothing', async t => {
    const f = await fixture(t); f.subscribe(); f.ipc.emit(channels.subscribe, f.event(), false);
    await f.invoke(channels.start, f.request); assert.equal(f.contents.sent.length, 0);
    const hostile = await f.ipc.handlers.get(channels.get)({ ...f.event(), senderFrame: {} }, f.request.conversationId); assert.equal(hostile.ok, false);
    f.trusted.clear(); f.subscribe(); assert.equal((await f.invoke(channels.get, f.request.conversationId)).ok, false);
    await f.composition.shutdown(); assert.equal(f.ipc.handlers.size, 0); assert.equal(f.ipc.listenerCount(channels.subscribe), 0); assert.equal(f.contents.eventNames().length, 0);
  });
  await t.test('preload exposes four narrow methods, deduplicates callbacks and unsubscribes exactly once', async () => {
    const ipc = new EventEmitter(), sent = [], invoked = [];
    ipc.send = (...args) => sent.push(args); ipc.invoke = async (...args) => { invoked.push(args); return { ok: true, value: null }; };
    const api = createOrchestrationApi(ipc); assert.deepEqual(Object.keys(api).sort(), ['retryTaskExecution', 'cancelTaskExecution', 'startNextTaskExecution', 'cancelTeamPrompt', 'createTeamConversation', 'continueTeamPrompt', 'getConversationOrchestration', 'startTeamPrompt', 'subscribeToOrchestrationChanges'].sort());
    let calls = 0; const listener = () => calls++;
    const off = api.subscribeToOrchestrationChanges(listener), repeated = api.subscribeToOrchestrationChanges(listener); assert.equal(off, repeated);
    assert.equal(ipc.listenerCount(channels.changed), 1); ipc.emit(channels.changed, {}, { conversationId: 'c', view: {} }); assert.equal(calls, 1);
    off(); off(); assert.equal(ipc.listenerCount(channels.changed), 0); assert.deepEqual(sent, [[channels.subscribe, true], [channels.subscribe, false]]);
    await api.getConversationOrchestration('c'); await api.startTeamPrompt({ message: 'request' }); await api.continueTeamPrompt({ runId: 'r', message: 'answer' });
    assert.deepEqual(invoked.map(args => args[0]), [channels.get, channels.start, channels.continue]);
  });
  await t.test('startup recovery fails only stale planning and is idempotent with session preserved', async t => {
    let originals;
    const f = await fixture(t, async ({ repository, conversationId }) => {
      originals = new Map();
      for (const status of ['planning', 'waiting_input', 'running', 'completed', 'failed', 'cancelled']) {
        const d = id => ({ id: status + id, agentId: 'lead', occurredAt: now });
        await repository.create(createTeamRun({ id: status, conversationId, projectId: 'project', teamId: 'team', organizerAgentId: 'lead', goal: 'PRIVATE_GOAL' }, d('created')));
        await repository.update(status, state => applyOrchestrationCommand(state, { type: 'run.set_organizer_session', session: { runtime: 'codex', externalSessionId: 'SECRET_RECOVERY' } }, d('session')));
        if (status !== 'planning') await repository.update(status, state => applyOrchestrationCommand(state, status === 'completed' ? { type: 'run.respond' } : { type: 'run.transition', status, reason: 'Safe reason' }, d('status')));
        if (status === 'running') await repository.update(status, state => applyOrchestrationCommand(state, { type: 'tasks.create', tasks: [{ ...task('build'), id: 'task' }] }, d('tasks')));
        originals.set(status, await repository.rehydrate(status));
      }
    });
    const recovered = await f.repository.rehydrate('planning'); assert.equal(recovered.state.run.status, 'failed');
    assert.equal(recovered.events.at(-1).type, 'run.failed'); assert.equal(recovered.events.at(-1).reason, 'PLANNING_INTERRUPTED');
    assert.ok(!JSON.stringify(recovered.events.at(-1)).includes('PRIVATE_GOAL')); assert.deepEqual(recovered.state.run.organizerSession, originals.get('planning').state.run.organizerSession);
    for (const status of ['waiting_input', 'running', 'completed', 'failed', 'cancelled']) assert.deepEqual(await f.repository.rehydrate(status), originals.get(status));
    await recoverPlanningRuns(f.repository, { newId: randomUUID, now: () => new Date().toISOString() });
    assert.deepEqual(await f.repository.rehydrate('planning'), recovered); assert.equal(f.calls.length, 0);
  });
  await t.test('corrupt startup record disables orchestration safely without aborting composition', async t => {
    const f = await fixture(t, async ({ options }) => {
      const dir = path.join(options.app.getPath('userData'), 'orchestration'); await fs.mkdir(dir);
      await fs.writeFile(path.join(dir, 'a'.repeat(64) + '.json'), '{SECRET_BROKEN');
    });
    const result = await f.invoke(channels.start, f.request);
    assert.equal(result.error.code, 'ORCHESTRATION_FAILED'); assert.equal(f.calls.length, 0);
    assert.equal(f.ipc.handlers.size, 8); assert.ok(!JSON.stringify(result).includes('SECRET'));
  });
  await t.test('window closure during continuation lookup cannot start a late model turn', async t => {
    const f = await fixture(t); f.choose(ask); const first = await f.invoke(channels.start, f.request);
    const repository = f.composition.service.repository, original = repository.getRun.bind(repository);
    let release, enter; const started = new Promise(resolve => enter = resolve);
    repository.getRun = async id => { enter(); await new Promise(resolve => release = resolve); return original(id); };
    const pending = f.invoke(channels.continue, { runId: first.value.runId, message: 'Answer' }); await started;
    f.contents.destroy(); release(); const result = await pending;
    assert.equal(result.ok, false); assert.equal(f.calls.length, 1);
    assert.equal((await f.repository.getRun(first.value.runId)).status, 'waiting_input');
  });
  await t.test('navigation clears subscription and a new page can subscribe once again', async t => {
    const f = await fixture(t); f.subscribe(); f.contents.emit('did-start-navigation', {}, 'new-page', false, true);
    assert.equal(f.contents.eventNames().length, 0);
    f.subscribe(); f.subscribe(); await f.invoke(channels.start, f.request);
    assert.deepEqual(f.contents.sent.map(item => item.data.view.run.status), ['planning', 'planning', 'completed']);
    assert.equal(f.contents.listenerCount('destroyed'), 1);
  });
  await t.test('newly registered project cannot encompass the orchestration profile', async t => {
    const f = await fixture(t); f.data.project.path = f.directory;
    const result = await f.invoke(channels.start, f.request);
    assert.equal(result.error.code, 'ORCHESTRATION_FAILED'); assert.equal(f.calls.length, 0);
  });
  await t.test('the full preload retains existing APIs alongside the new narrow API', async () => {
    const vm = require('node:vm'); const ipc = new EventEmitter(), calls = []; let exposed;
    ipc.invoke = async (...args) => { calls.push(args); return { ok: true, value: null }; }; ipc.send = () => {};
    const source = await fs.readFile(path.join(base, 'preload/preload.js'), 'utf8');
    const wrapper = vm.runInThisContext('(function(require,exports){' + source + '\n})');
    wrapper(id => id === 'electron' ? { ipcRenderer: ipc, contextBridge: { exposeInMainWorld: (name, api) => { assert.equal(name, 'flux'); exposed = api; } } }
      : require(path.resolve(base, 'preload', id)), {});
    assert.ok(Object.isFrozen(exposed));
    for (const key of ['getProjects', 'getAgents', 'getTeams', 'getConversations', 'getCodexRuntimeState', 'getConversationOrchestration']) await exposed[key]('conversation');
    assert.equal(calls.length, 6); assert.equal(exposed.invoke, undefined); assert.equal(exposed.send, undefined);
  });
  async function journalFixture(t) {
    let store;
    const f = await fixture(t, async ({ options }) => {
      const { ConversationRepository } = load('main/chat/ConversationRepository');
      store = new ConversationRepository(path.join(options.app.getPath('userData'), 'conversations'));
      options.conversations = store;
    });
    const created = await f.invoke(channels.create, { projectId: 'project', branch: 'main', teamId: 'team' });
    assert.equal(created.ok, true); f.request.conversationId = created.value.id;
    return { ...f, store };
  }
  for (const decision of [respond, ask, plan]) await t.test('persistent team conversation stores ' + decision.type + ' once and restores', async t => {
    const f = await journalFixture(t); f.choose(decision); f.subscribe();
    const result = await f.invoke(channels.start, f.request); assert.equal(result.ok, true);
    const detail = result.value.view.conversation; assert.equal(detail.mode, 'team'); assert.equal(detail.messages.length, 2);
    assert.equal(detail.messages[0].role, 'user'); assert.equal(detail.messages[1].role, 'agent'); assert.ok(detail.messages[1].content.includes(decision.message));
    if (decision.type === 'ask_user') assert.ok(detail.messages[1].content.includes(decision.questions[0]));
    if (decision.type === 'create_plan') assert.equal(detail.messages[1].planRunId, result.value.runId);
    const read = await f.invoke(channels.get, detail.id); assert.deepEqual(read.value, result.value.view);
    const restarted = await composeOrchestration(f.options, { resolve: async () => { throw new Error('No automatic runtime'); } });
    const restored = await restarted.service.get(detail.id); assert.deepEqual(restored, read.value); await restarted.shutdown();
    assert.equal((await f.store.get(detail.id)).messages.length, 2);
    assert.equal(new Set(detail.messages.map(message => message.id)).size, 2);
    assert.ok(f.contents.sent.every(event => (event.data.view.conversation?.messages.filter(message => message.role === 'agent').length ?? 0) <= 1));
    assert.ok(!JSON.stringify(result).includes('SECRET'));
  });
  await t.test('team waiting-input resumes same run/session and old single-agent record is rejected', async t => {
    const f = await journalFixture(t); f.choose(ask); const first = await f.invoke(channels.start, f.request);
    f.choose(plan); const next = await f.invoke(channels.continue, { runId: first.value.runId, message: 'Use defaults' });
    assert.equal(next.ok, true); assert.equal(next.value.runId, first.value.runId); assert.equal(f.calls[1].options.threadId, f.calls[0].id);
    assert.equal(next.value.view.conversation.messages.length, 4);
    const legacy = await f.store.get(f.request.conversationId); delete legacy.mode; legacy.id = randomUUID(); await f.store.save(legacy);
    const rejected = await f.invoke(channels.start, { ...f.request, conversationId: legacy.id }); assert.equal(rejected.ok, false); assert.equal(f.calls.length, 2);
  });
  await t.test('typed Stop is idempotent, publishes cancelled, and completion wins after commit', async t => {
    const f = await journalFixture(t); f.subscribe(); let enter; const entered = new Promise(resolve => enter = resolve);
    f.choose(async (_options, _prompt, signal) => { enter(); return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Stop')), { once: true })); });
    const pending = f.invoke(channels.start, f.request); await entered;
    const run = (await f.repository.listAllRuns())[0];
    const cancelled = await Promise.all([f.invoke(channels.cancel, { runId: run.id }), f.invoke(channels.cancel, { runId: run.id })]);
    assert.ok(cancelled.every(result => result.ok)); await pending;
    const saved = await f.repository.rehydrate(run.id); assert.equal(saved.state.run.status, 'cancelled'); assert.equal(saved.events.filter(event => event.type === 'run.cancelled').length, 1);
    assert.equal(f.contents.sent.at(-1).data.view.run.status, 'cancelled');
    const completed = await journalFixture(t); const result = await completed.invoke(channels.start, completed.request);
    await completed.invoke(channels.cancel, { runId: result.value.runId });
    assert.equal((await completed.repository.getRun(result.value.runId)).status, 'completed');
  });
  await t.test('real local branch reads never change fixture repository HEAD or files', async t => {
    const f = await fixture(t);
    const git = args => execFileSync('git', args, { cwd: f.projectPath, encoding: 'utf8', windowsHide: true }).trim();
    git(['init', '--initial-branch=main']); git(['-c', 'user.name=Flux Test', '-c', 'user.email=fixture@invalid', '-c', 'core.hooksPath=NUL', 'commit', '--allow-empty', '-m', 'Fixture']); git(['branch', 'feature']);
    const before = git(['rev-parse', 'HEAD']), files = git(['status', '--porcelain']);
    const { GitRepositoryService } = load('main/projects/GitRepositoryService'); const reader = new GitRepositoryService();
    f.options.projects.getGitBranches = directory => reader.getLocalBranches(directory);
    f.data.project.selectedBranch = 'feature'; f.data.conversation.branchName = 'feature';
    const good = await f.invoke(channels.start, { ...f.request, branch: 'feature' }); assert.equal(good.ok, true);
    const bad = await f.invoke(channels.start, { ...f.request, branch: 'missing' }); assert.equal(bad.error.code, 'BRANCH_NOT_FOUND');
    assert.equal(git(['rev-parse', 'HEAD']), before); assert.equal(git(['branch', '--show-current']), 'main'); assert.equal(git(['status', '--porcelain']), files);
  });
  await t.test('IPC error mapping exposes only fixed codes and messages', () => {
    for (const code of ['PROJECT_NOT_FOUND', 'CONVERSATION_NOT_FOUND', 'CONVERSATION_PROJECT_MISMATCH', 'BRANCH_NOT_FOUND', 'TEAM_NOT_FOUND', 'TEAM_NOT_RUNNABLE', 'ORGANIZER_NOT_AVAILABLE', 'RUNTIME_NOT_READY', 'RUN_NOT_FOUND', 'RUN_NOT_WAITING_INPUT', 'ORCHESTRATION_BUSY', 'ORCHESTRATION_FAILED']) {
      const e = new OrchestrationBoundaryError(code); e.message = 'SECRET raw path'; e.stack = 'SECRET_STACK';
      const safe = orchestrationError(e); assert.equal(safe.code, code); assert.ok(!JSON.stringify(safe).includes('SECRET'));
    }
    assert.equal(orchestrationError(new TeamPromptError('RUNTIME_UNSUPPORTED')).code, 'RUNTIME_NOT_READY');
    assert.deepEqual(orchestrationError(new Error('SECRET_STDOUT')), orchestrationError(null));
  });
  await t.test('development profile migration is bounded, preserves records and excludes caches', async t => {
    const dir = await fs.mkdtemp(path.join(base, 'profile-')); t.after(() => remove(dir));
    const legacy = path.join(dir, 'project', '.flux', 'desktop'); await fs.mkdir(legacy, { recursive: true });
    const { developmentProfilePath, migrateDevelopmentProfile } = load('main/persistence/developmentProfile');
    const destination = developmentProfilePath(path.join(dir, 'app-data')); assert.ok(!destination.startsWith(path.join(dir, 'project')));
    await fs.writeFile(path.join(legacy, 'projects.json'), 'saved-projects'); await fs.writeFile(path.join(legacy, 'Cache'), 'excluded');
    await fs.mkdir(path.join(legacy, 'conversations')); await fs.writeFile(path.join(legacy, 'conversations', randomUUID() + '.json'), 'saved-conversation');
    await migrateDevelopmentProfile(legacy, destination); assert.equal(await fs.readFile(path.join(destination, 'projects.json'), 'utf8'), 'saved-projects');
    assert.equal((await fs.readdir(path.join(destination, 'conversations'))).length, 1); assert.ok(!(await fs.readdir(destination)).includes('Cache'));
    await fs.writeFile(path.join(destination, 'projects.json'), 'newer'); await migrateDevelopmentProfile(legacy, destination);
    assert.equal(await fs.readFile(path.join(destination, 'projects.json'), 'utf8'), 'newer'); assert.equal(await fs.readFile(path.join(legacy, 'projects.json'), 'utf8'), 'saved-projects');
  });
});
