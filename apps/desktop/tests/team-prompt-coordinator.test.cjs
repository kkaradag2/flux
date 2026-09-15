'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');

test('Team prompt planning flow', async t => {
  const parent = path.join(root, '.cache/team-prompt-tests');
  await fs.mkdir(parent, { recursive: true });
  const output = await fs.mkdtemp(path.join(parent, 'run-'));
  async function remove(directory) {
    const relative = path.relative(parent, path.resolve(directory));
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    await fs.rm(directory, { recursive: true, force: true });
  }
  t.after(() => remove(output));
  async function compile(directory) {
    await fs.mkdir(path.join(output, directory), { recursive: true });
    for (const file of await fs.readdir(path.join(root, 'apps/desktop/src', directory), { withFileTypes: true })) {
      if (file.isDirectory()) { await compile(path.join(directory, file.name)); continue; }
      if (!file.name.endsWith('.ts') || file.name.endsWith('.d.ts')) continue;
      const source = await fs.readFile(path.join(root, 'apps/desktop/src', directory, file.name), 'utf8');
      await fs.writeFile(path.join(output, directory, file.name.replace(/\.ts$/, '.js')), ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      }).outputText);
    }
  }
  for (const directory of ['domain/orchestration', 'application/orchestration', 'application/runtime', 'main/orchestration', 'main/persistence']) await compile(directory);
  const load = file => require(path.join(output, file));
  const { TeamPromptCoordinator } = load('application/orchestration/TeamPromptCoordinator');
  const { TeamPromptError } = load('application/orchestration/TeamPromptError');
  const { OrganizerDecisionExecutor } = load('application/orchestration/organizer/OrganizerDecisionExecutor');
  const { AgentRuntimeRouter } = load('application/runtime/AgentRuntimeRouter');
  const { AgentRuntimeError } = load('application/runtime/AgentRuntimeError');
  const { JsonOrchestrationRepository } = load('main/orchestration/JsonOrchestrationRepository');
  const { AtomicFileWriter } = load('main/persistence/AtomicFileWriter');
  const { createTeamRun, applyOrchestrationCommand } = load('domain/orchestration');
  const request = { projectId: 'project', conversationId: 'conversation', teamId: 'team', prompt: 'Build a useful feature' };
  const session = { runtime: 'claude', externalSessionId: 'session-a' };
  const respond = { type: 'respond', message: 'Here is the answer.' };
  const ask = { type: 'ask_user', message: 'Please clarify.', questions: ['Which format?'] };
  const task = (key, dependsOn = []) => ({ key, title: key, description: 'Implement ' + key, assigneeAgentId: 'developer', dependsOn, acceptanceCriteria: ['Works'], requiresReview: true });
  const plan = { type: 'create_plan', message: 'Plan prepared.', planSummary: 'Build then verify', tasks: [task('build'), task('verify', ['build'])] };
  const fails = code => error => error instanceof TeamPromptError && error.code === code;
  async function fixture(t, useFakeExecutor = false) {
    const directory = await fs.mkdtemp(path.join(output, 'case-')); t.after(() => remove(directory));
    const userData = path.join(directory, 'data'), projectPath = path.join(directory, 'project');
    await fs.mkdir(userData); await fs.mkdir(projectPath);
    const data = {
      selected: 'project', project: { id: 'project', name: 'Flux', path: projectPath },
      conversation: { id: 'conversation', projectId: 'project', branchName: 'main' },
      team: { id: 'team', name: 'Core Team', agentIds: ['lead', 'developer'], organizerAgentId: 'lead' },
      agents: ['lead', 'developer'].map(id => ({ id, name: id, description: id, enabled: true, instructions: id + ' private instruction', runtime: { type: 'claude', model: null, reasoningEffort: 'default' } })),
    };
    const source = { getSelectedProjectId: async () => data.selected, getProject: async () => data.project,
      getConversation: async () => data.conversation, getTeam: async () => data.team, getAgents: async () => data.agents };
    const writes = [], atomic = new AtomicFileWriter(); let failPlan = false;
    const writer = { write: async (file, content) => {
      const record = JSON.parse(content);
      if (failPlan && record.plans.length) throw new Error('SECRET disk error');
      await atomic.write(file, content); writes.push(record);
    } };
    const location = { userDataDirectory: userData, excludedDirectories: [projectPath] };
    const repository = new JsonOrchestrationRepository(location, writer);
    const calls = []; let behavior = async () => respond;
    const capabilities = { structuredOutput: true, persistentSessions: true, streaming: false, cancellation: true, toolExecution: false, workingDirectory: true, sandboxing: true };
    const adapter = { type: 'claude', getCapabilities: () => capabilities, cancel: async () => {}, runTurn: async input => {
      calls.push(input);
      const rows = await repository.listRuns('conversation');
      assert.equal(rows[0].status, 'planning', 'run is durably planning before execution');
      await input.onSession(session);
      assert.deepEqual((await repository.getRun(rows[0].id)).organizerSession, session, 'session saved before model output');
      return { value: await behavior(input), session, durationMs: 3 };
    } };
    const router = new AgentRuntimeRouter([adapter]);
    const executor = useFakeExecutor ? { assertSupported: type => router.get(type, ['structuredOutput']), execute: async input => {
      const result = await adapter.runTurn(input); return { decision: result.value, session: result.session, durationMs: result.durationMs };
    } } : new OrganizerDecisionExecutor(router);
    let sequence = 0;
    const values = { newId: () => 'generated-' + (++sequence), now: () => '2026-09-15T14:00:00.000Z' };
    const coordinator = new TeamPromptCoordinator(source, repository, executor, values);
    return { coordinator, repository, location, source, executor, values, data, writes, calls, capabilities,
      behavior: value => { behavior = value; }, failPlan: () => { failPlan = true; } };
  }

  for (const [label, change, code] of [
    ['one member', f => f.data.team.agentIds = ['lead'], 'INVALID_TEAM'],
    ['no Organizer', f => f.data.team.organizerAgentId = null, 'INVALID_TEAM'],
    ['Organizer outside team', f => f.data.team.organizerAgentId = 'other', 'INVALID_TEAM'],
    ['duplicate member', f => f.data.team.agentIds = ['lead', 'lead'], 'INVALID_TEAM'],
    ['missing member', f => f.data.team.agentIds.push('unknown'), 'INVALID_TEAM'],
    ['disabled Organizer', f => f.data.agents[0].enabled = false, 'ORGANIZER_DISABLED'],
    ['unselected project', f => f.data.selected = null, 'PROJECT_UNAVAILABLE'],
    ['missing project', f => f.data.project = null, 'PROJECT_UNAVAILABLE'],
    ['missing conversation', f => f.data.conversation = null, 'CONVERSATION_UNAVAILABLE'],
    ['cross-project conversation', f => f.data.conversation.projectId = 'another', 'CONVERSATION_UNAVAILABLE'],
    ['unsupported runtime', f => f.data.agents[0].runtime.type = 'unsupported', 'RUNTIME_UNSUPPORTED'],
    ['missing structured output', f => f.capabilities.structuredOutput = false, 'RUNTIME_UNSUPPORTED'],
  ]) await t.test(label + ' rejected before runtime or persistence', async t => {
    const f = await fixture(t); change(f);
    await assert.rejects(f.coordinator.start(request), fails(code)); assert.equal(f.calls.length, 0); assert.equal(f.writes.length, 0);
  });
  await t.test('respond produces a completed run without plan or tasks using trusted data', async t => {
    const f = await fixture(t, true), result = await f.coordinator.start(request);
    assert.equal(result.type, 'respond'); assert.equal(result.message, respond.message);
    const saved = await f.repository.rehydrate(result.runId);
    assert.equal(saved.state.run.status, 'completed'); assert.deepEqual(saved.state.tasks, []); assert.equal(saved.currentPlan, null);
    assert.equal(saved.events.at(-1).type, 'run.completed');
    assert.equal(f.calls[0].cwd, f.data.project.path); assert.equal(f.calls[0].instruction, f.data.agents[0].instructions);
  });
  await t.test('ask_user persists waiting session and makes no further calls', async t => {
    const f = await fixture(t); f.behavior(async () => ask);
    const result = await f.coordinator.start(request), saved = await f.repository.rehydrate(result.runId);
    assert.deepEqual(result.questions, ask.questions); assert.equal(saved.state.run.status, 'waiting_input');
    assert.deepEqual(saved.state.run.organizerSession, session); assert.equal(saved.state.tasks.length, 0); assert.equal(f.calls.length, 1);
    assert.deepEqual(f.calls[0].policy, { readOnly: true, network: false, tools: false });
  });
  await t.test('first plan maps IDs, owners and dependencies; events and state use one atomic snapshot', async t => {
    const f = await fixture(t); f.behavior(async () => plan);
    const result = await f.coordinator.start(request), saved = await f.repository.rehydrate(result.runId);
    assert.equal(result.type, 'plan_created'); assert.equal(result.plan.version, 1); assert.equal(saved.state.run.status, 'running');
    const [build, verify] = result.tasks;
    assert.notEqual(build.id, 'build'); assert.notEqual(verify.id, 'verify'); assert.notEqual(build.id, verify.id);
    assert.deepEqual(verify.dependsOn, [build.id]); assert.equal(build.status, 'ready'); assert.equal(verify.status, 'planned');
    for (const task of result.tasks) { assert.equal(task.runId, result.runId); assert.equal(task.assigneeAgentId, 'developer'); assert.equal(task.delegatorAgentId, 'lead'); assert.deepEqual(task.acceptanceCriteria, ['Works']); assert.equal(task.requiresReview, true); }
    assert.deepEqual(saved.events.map(e => e.type), ['run.created', 'run.organizer_session_set', 'plan.created', 'task.created', 'task.created', 'task.assigned', 'task.assigned', 'task.ready', 'run.status_changed']);
    assert.equal(new Set(saved.events.map(e => e.id)).size, saved.events.length);
    assert.equal(f.writes.length, 3); assert.equal(f.writes[1].plans.length, 0);
    assert.deepEqual(f.writes[2].tasks, saved.state.tasks); assert.deepEqual(f.writes[2].events, saved.events);
    assert.deepEqual(f.writes[2].run.organizerSession, session);
  });
  await t.test('runtime failure retains session and writes only safe failure data', async t => {
    const f = await fixture(t); f.behavior(async () => { throw new Error('SECRET raw runtime'); });
    await assert.rejects(f.coordinator.start(request), fails('RUNTIME_FAILED'));
    const run = (await f.repository.listRuns('conversation'))[0], saved = await f.repository.rehydrate(run.id);
    assert.equal(run.status, 'failed'); assert.deepEqual(run.organizerSession, session);
    assert.equal(saved.events.at(-1).type, 'run.failed'); assert.ok(!JSON.stringify(saved).includes('SECRET'));
  });
  await t.test('cancellation produces cancelled run', async t => {
    const f = await fixture(t); f.behavior(async () => { throw new AgentRuntimeError('RUNTIME_CANCELLED'); });
    await assert.rejects(f.coordinator.start(request), fails('CANCELLED'));
    assert.equal((await f.repository.listRuns('conversation'))[0].status, 'cancelled');
  });
  for (const next of [respond, ask, plan]) await t.test('restart continuation resumes same session and handles ' + next.type, async t => {
    const f = await fixture(t); f.behavior(async () => ask);
    const first = await f.coordinator.start(request);
    const reopened = new JsonOrchestrationRepository(f.location);
    const coordinator = new TeamPromptCoordinator(f.source, reopened, f.executor, f.values);
    f.behavior(async () => next);
    const result = await coordinator.continueRun(first.runId, 'PRIVATE_USER_ANSWER');
    assert.equal(result.runId, first.runId); assert.deepEqual(f.calls[1].session, session); assert.equal(f.calls[1].prompt, 'PRIVATE_USER_ANSWER');
    const saved = await reopened.rehydrate(first.runId);
    assert.deepEqual(saved.state.run.organizerSession, session); assert.ok(!JSON.stringify(saved.events).includes('PRIVATE_USER_ANSWER'));
    assert.equal(saved.events.filter(e => e.type === 'run.organizer_session_set').length, 1);
    if (next.type === 'create_plan') assert.equal(saved.currentPlan.version, 1);
  });
  await t.test('explicit completed follow-up retains session; missing session cannot continue', async t => {
    const f = await fixture(t); const result = await f.coordinator.start(request);
    const continued = await f.coordinator.continueRun(result.runId, 'Continue'); assert.equal(continued.runId, result.runId); assert.deepEqual(f.calls[1].session, session);
    const d = id => ({ id, agentId: 'lead', occurredAt: f.values.now() });
    const initial = createTeamRun({ ...request, id: 'legacy', organizerAgentId: 'lead', goal: 'Question' }, d('legacy-created'));
    await f.repository.create(initial);
    await f.repository.update('legacy', state => applyOrchestrationCommand(state, { type: 'run.transition', status: 'waiting_input' }, d('waiting')));
    await assert.rejects(f.coordinator.continueRun('legacy', 'Continue'), fails('SESSION_UNAVAILABLE')); assert.equal(f.calls.length, 2);
  });
  await t.test('parallel continuation across coordinator instances is rejected and lock released', async t => {
    const f = await fixture(t); f.behavior(async () => ask); const first = await f.coordinator.start(request);
    let release, entered; const started = new Promise(resolve => entered = resolve);
    f.behavior(async () => { entered(); return new Promise(resolve => release = () => resolve(ask)); });
    const pending = f.coordinator.continueRun(first.runId, 'Answer'); await started;
    const other = new TeamPromptCoordinator(f.source, f.repository, f.executor, f.values);
    await assert.rejects(other.continueRun(first.runId, 'Duplicate'), fails('RUN_BUSY'));
    release(); await pending; f.behavior(async () => respond); await other.continueRun(first.runId, 'Next'); assert.equal(f.calls.length, 3);
  });
  await t.test('continuation failure preserves good session and empty plan history', async t => {
    const f = await fixture(t); f.behavior(async () => ask); const first = await f.coordinator.start(request);
    const previous = await f.repository.getEvents(first.runId);
    f.behavior(async () => { throw new Error('SECRET follow-up'); });
    await assert.rejects(f.coordinator.continueRun(first.runId, 'PRIVATE_USER_ANSWER'), fails('RUNTIME_FAILED'));
    const saved = await f.repository.rehydrate(first.runId);
    assert.deepEqual(saved.events.slice(0, previous.length), previous); assert.deepEqual(saved.state.run.organizerSession, session);
    assert.equal(saved.state.run.status, 'failed'); assert.equal(saved.state.plans.length, 0);
    assert.ok(!JSON.stringify(saved.events).includes('PRIVATE_USER_ANSWER')); assert.ok(!JSON.stringify(saved).includes('SECRET'));
  });
  await t.test('failed plan write never persists partial plan or tasks', async t => {
    const f = await fixture(t); f.behavior(async () => plan); f.failPlan();
    await assert.rejects(f.coordinator.start(request), fails('PERSISTENCE_FAILED'));
    const run = (await f.repository.listRuns('conversation'))[0], saved = await f.repository.rehydrate(run.id);
    assert.equal(run.status, 'failed'); assert.deepEqual(run.organizerSession, session);
    assert.equal(saved.state.tasks.length, 0); assert.equal(saved.state.plans.length, 0);
    assert.ok(!saved.events.some(e => e.type === 'task.created')); assert.ok(!JSON.stringify(saved).includes('SECRET'));
  });
  await t.test('legacy records without session hydrate null and save back compatibly', async t => {
    const f = await fixture(t); await f.coordinator.start(request);
    const dir = path.join(f.location.userDataDirectory, 'orchestration'), file = path.join(dir, (await fs.readdir(dir))[0]);
    const record = JSON.parse(await fs.readFile(file, 'utf8')); delete record.run.organizerSession;
    delete record.events[0].run.organizerSession; record.events = record.events.filter(e => e.type !== 'run.organizer_session_set');
    await fs.writeFile(file, JSON.stringify(record));
    const saved = await new JsonOrchestrationRepository(f.location).rehydrate(record.run.id);
    assert.equal(saved.state.run.organizerSession, null); assert.equal(saved.events[0].run.organizerSession, null);
    await f.repository.save({ state: saved.state, events: [] }, saved.revision);
    assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).run.organizerSession, null);
  });
  await t.test('invalid fake executor decision cannot create a partial plan', async t => {
    const f = await fixture(t, true); f.behavior(async () => ({ ...plan, tasks: [task('build', ['missing'])] }));
    await assert.rejects(f.coordinator.start(request), fails('RUNTIME_FAILED'));
    const run = (await f.repository.listRuns('conversation'))[0], saved = await f.repository.rehydrate(run.id);
    assert.equal(run.status, 'failed'); assert.equal(saved.state.tasks.length, 0); assert.equal(saved.state.plans.length, 0);
  });
  await t.test('session cannot silently change during continuation', async t => {
    const f = await fixture(t, true); f.behavior(async () => ask); const first = await f.coordinator.start(request);
    f.executor.execute = async () => ({ decision: respond, session: { ...session, externalSessionId: 'different' }, durationMs: 0 });
    await assert.rejects(f.coordinator.continueRun(first.runId, 'Answer'), fails('SESSION_UNAVAILABLE'));
    const saved = await f.repository.getRun(first.runId); assert.equal(saved.status, 'failed'); assert.deepEqual(saved.organizerSession, session);
  });
  await t.test('session write failure stops runtime before output and keeps the prior snapshot', async t => {
    const f = await fixture(t); const previousUpdate = f.repository.update.bind(f.repository);
    const { OrchestrationPersistenceError } = load('application/orchestration/OrchestrationPersistenceError');
    f.repository.update = async () => { throw new OrchestrationPersistenceError('WRITE_FAILED'); };
    let producedOutput = false; f.behavior(async () => { producedOutput = true; return respond; });
    await assert.rejects(f.coordinator.start(request), fails('PERSISTENCE_FAILED'));
    const run = (await f.repository.listRuns('conversation'))[0]; assert.equal(run.status, 'planning'); assert.equal(run.organizerSession, null);
    assert.equal(producedOutput, false); assert.equal(f.writes.length, 1); assert.equal((await f.repository.getEvents(run.id)).length, 1);
    f.repository.update = previousUpdate;
  });
  await t.test('invalid persisted session is a typed persistence error', async t => {
    const f = await fixture(t); const result = await f.coordinator.start(request);
    const dir = path.join(f.location.userDataDirectory, 'orchestration'), file = path.join(dir, (await fs.readdir(dir))[0]);
    const record = JSON.parse(await fs.readFile(file, 'utf8')); record.run.organizerSession = { runtime: 'unsupported', externalSessionId: 'x' };
    await fs.writeFile(file, JSON.stringify(record));
    await assert.rejects(f.repository.rehydrate(result.runId), e => e.code === 'INVALID_RECORD');
  });
  await t.test('session assignment and initial plan commands enforce central domain guards', () => {
    const decision = id => ({ id, agentId: 'lead', occurredAt: '2026-09-15T14:00:00.000Z' });
    const created = createTeamRun({ ...request, id: 'domain-run', organizerAgentId: 'lead', goal: 'Plan' }, decision('created'));
    const attached = applyOrchestrationCommand(created.state, { type: 'run.set_organizer_session', session }, decision('session'));
    assert.equal(applyOrchestrationCommand(attached.state, { type: 'run.set_organizer_session', session }, decision('repeat')).events.length, 0);
    assert.throws(() => applyOrchestrationCommand(attached.state, { type: 'run.set_organizer_session', session: { ...session, externalSessionId: 'other' } }, decision('replace')), e => e.code === 'INVALID_INPUT');
    const command = { type: 'plan.initialize', id: 'plan', summary: 'Build', tasks: [{ ...task('build'), id: 'task-id' }] };
    assert.throws(() => applyOrchestrationCommand(attached.state, command, { ...decision('bad-actor'), agentId: 'developer' }), e => e.code === 'ORGANIZER_REQUIRED');
    const planned = applyOrchestrationCommand(attached.state, command, decision('plan'));
    assert.throws(() => applyOrchestrationCommand(planned.state, command, decision('repeat-plan')), e => e.code === 'INVALID_PLAN');
    assert.throws(() => applyOrchestrationCommand(planned.state, { type: 'run.respond' }, decision('skip-tasks')), e => e.code === 'INVALID_RUN_TRANSITION');
  });
  await t.test('application and domain remain independent from runtime protocol and infrastructure', async () => {
    async function inspect(directory) {
      for (const file of await fs.readdir(directory, { withFileTypes: true })) {
        if (file.isDirectory()) { await inspect(path.join(directory, file.name)); continue; }
        const source = await fs.readFile(path.join(directory, file.name), 'utf8');
        assert.doesNotMatch(source, /CodexAppServer|threadId|outputSchema|turn\/start|from ['"](?:\.\.\/)+main\/|from ['"]node:/);
      }
    }
    await inspect(path.join(root, 'apps/desktop/src/application/orchestration'));
    await inspect(path.join(root, 'apps/desktop/src/domain/orchestration'));
  });
});
