'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const output = path.join(root, '.cache/orchestration-domain-tests', String(Date.now()));

test('Task orchestration domain', async t => {
  await fs.mkdir(output, { recursive: true });
  const sourceDirectory = path.join(root, 'apps/desktop/src/domain/orchestration');
  for (const file of await fs.readdir(sourceDirectory)) {
    if (!file.endsWith('.ts')) continue;
    const source = await fs.readFile(path.join(sourceDirectory, file), 'utf8');
    assert.ok(!/from\s+['"](?:node:|electron|react|\.\.\/)/.test(source), 'Domain must depend only on its own types and pure functions');
    await fs.writeFile(path.join(output, file.replace(/\.ts$/, '.js')), ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, strict: true },
    }).outputText);
  }
  const { createTeamRun, applyOrchestrationCommand: apply, OrchestrationError, validateTaskGraph } = require(path.join(output, 'index.js'));
  const runInput = { id: 'run', conversationId: 'conversation', projectId: 'project', teamId: 'team', organizerAgentId: 'lead', goal: 'Deliver the request' };
  const fixedDecision = { id: 'decision', agentId: 'lead', occurredAt: '2026-09-15T12:00:00.000Z' };
  const taskInput = (id, overrides = {}) => ({ id, title: id, description: 'Implement ' + id, assigneeAgentId: 'developer', dependsOn: [], acceptanceCriteria: ['Acceptance criteria pass'], requiresReview: false, ...overrides });
  const throws = (operation, code) => assert.throws(operation, error => error instanceof OrchestrationError && error.code === code);
  function fixture(tasks = []) {
    let tick = 0;
    const decision = (agentId = 'lead') => ({ id: 'decision-' + (++tick), agentId, occurredAt: new Date(Date.parse(fixedDecision.occurredAt) + tick * 1000).toISOString() });
    const created = createTeamRun(runInput, decision()); let state = created.state;
    const events = [...created.events];
    const command = (value, agentId = 'lead') => {
      const result = apply(state, value, decision(agentId)); state = result.state; events.push(...result.events); return result;
    };
    if (tasks.length) command({ type: 'tasks.create', tasks });
    return { get state() { return state; }, events, decision, command, task: id => state.tasks.find(task => task.id === id),
      running: () => command({ type: 'run.transition', status: 'running' }),
      transition: (id, status, reason, agentId = status === 'working' ? 'developer' : 'lead') => command({ type: 'task.transition', taskId: id, status, ...(reason ? { reason } : {}) }, agentId) };
  }

  await t.test('dependency-free task becomes ready with one assignee, a delegator and ordered typed events', () => {
    const f = fixture([taskInput('build')]); const task = f.task('build');
    assert.equal(task.status, 'ready'); assert.equal(task.assigneeAgentId, 'developer'); assert.equal(task.delegatorAgentId, 'lead');
    assert.equal(task.required, true); assert.equal(task.startedAt, null); assert.equal(task.completedAt, null);
    assert.deepEqual(f.events.map(event => event.type), ['run.created', 'task.created', 'task.ready']);
    assert.equal(f.events[1].task.status, 'planned'); assert.equal(f.events[2].taskId, 'build'); assert.equal(f.events[2].agentId, 'developer');
    assert.equal(f.events[2].actorAgentId, 'lead');
  });
  await t.test('only ready tasks start; dependencies release waiters only after completion', () => {
    const f = fixture([taskInput('build'), taskInput('test', { dependsOn: ['build'] })]); f.running();
    throws(() => f.transition('test', 'working'), 'INVALID_TASK_TRANSITION');
    throws(() => f.transition('test', 'ready'), 'DEPENDENCIES_NOT_COMPLETED');
    f.transition('build', 'working'); assert.equal(f.task('test').status, 'planned');
    const result = f.transition('build', 'completed');
    assert.deepEqual(result.events.map(event => event.type), ['task.completed', 'task.ready']);
    assert.equal(f.task('test').status, 'ready'); f.transition('test', 'working'); assert.equal(f.task('test').status, 'working');
  });
  await t.test('all fan-in dependencies must complete and cancelled/failed dependencies never satisfy readiness', () => {
    for (const outcome of ['completed', 'failed', 'cancelled']) {
      const f = fixture([taskInput('one'), taskInput('two'), taskInput('waiter', { dependsOn: ['one', 'two'] })]); f.running();
      f.transition('one', 'working'); f.transition('one', 'completed'); assert.equal(f.task('waiter').status, 'planned');
      f.transition('two', 'working'); f.transition('two', outcome, 'Outcome recorded');
      assert.equal(f.task('waiter').status, outcome === 'completed' ? 'ready' : 'planned');
    }
  });
  for (const [name, tasks, code] of [
    ['self dependency', [taskInput('one', { dependsOn: ['one'] })], 'SELF_DEPENDENCY'],
    ['duplicate dependency', [taskInput('one'), taskInput('two', { dependsOn: ['one', 'one'] })], 'DUPLICATE_DEPENDENCY'],
    ['missing dependency', [taskInput('one', { dependsOn: ['missing'] })], 'MISSING_DEPENDENCY'],
    ['two-task cycle', [taskInput('one', { dependsOn: ['two'] }), taskInput('two', { dependsOn: ['one'] })], 'DEPENDENCY_CYCLE'],
    ['long cycle', [taskInput('one', { dependsOn: ['three'] }), taskInput('two', { dependsOn: ['one'] }), taskInput('three', { dependsOn: ['two'] })], 'DEPENDENCY_CYCLE'],
    ['duplicate task ID', [taskInput('one'), taskInput('one')], 'DUPLICATE_TASK_ID'],
  ]) await t.test(name + ' rejects the entire command without partial changes', () => {
    const f = fixture(), before = f.state;
    throws(() => f.command({ type: 'tasks.create', tasks }), code);
    assert.equal(f.state, before); assert.deepEqual(f.state.tasks, []); assert.equal(f.events.length, 1);
  });
  await t.test('editing dependencies revalidates cycles and removes stale readiness', () => {
    const f = fixture([taskInput('one'), taskInput('two')]);
    f.command({ type: 'task.set_dependencies', taskId: 'two', dependsOn: ['one'] }); assert.equal(f.task('two').status, 'planned');
    const before = f.state; throws(() => f.command({ type: 'task.set_dependencies', taskId: 'one', dependsOn: ['two'] }), 'DEPENDENCY_CYCLE');
    assert.equal(f.state, before);
    const result = f.command({ type: 'task.set_dependencies', taskId: 'two', dependsOn: [] });
    assert.equal(f.task('two').status, 'ready'); assert.deepEqual(result.events.map(event => event.type), ['task.dependencies_changed', 'task.ready']);
    f.running(); f.transition('two', 'working');
    throws(() => f.command({ type: 'task.set_dependencies', taskId: 'two', dependsOn: [] }), 'INVALID_TASK_TRANSITION');
  });
  await t.test('graph validation rejects cross-run tasks and handles a long DAG iteratively', () => {
    const f = fixture([taskInput('one')]);
    throws(() => validateTaskGraph('run', [{ ...f.task('one'), runId: 'foreign' }]), 'RUN_MISMATCH');
    const tasks = Array.from({ length: 10000 }, (_, index) => ({ ...f.task('one'), id: String(index), dependsOn: index ? [String(index - 1)] : [] }));
    assert.doesNotThrow(() => validateTaskGraph('run', tasks));
  });
  await t.test('one task cannot start twice and another agent cannot start the assignment', () => {
    const f = fixture([taskInput('one')]);
    throws(() => f.transition('one', 'working'), 'INVALID_TASK_TRANSITION'); f.running();
    throws(() => f.transition('one', 'working', undefined, 'stranger'), 'ACTOR_NOT_AUTHORIZED');
    f.transition('one', 'working'); const firstStart = f.task('one').startedAt;
    throws(() => f.transition('one', 'working'), 'INVALID_TASK_TRANSITION'); assert.equal(f.task('one').startedAt, firstStart);
  });
  await t.test('completed and cancelled tasks reject transitions, reassignment and dependency edits', () => {
    for (const status of ['completed', 'cancelled']) {
      const f = fixture([taskInput('one')]); f.running(); f.transition('one', 'working'); f.transition('one', status, 'Final outcome');
      assert.ok(f.task('one').completedAt);
      for (const next of ['planned', 'ready', 'working', 'blocked', 'needs_review', 'completed', 'failed', 'cancelled']) throws(() => f.transition('one', next, 'Retry'), 'TERMINAL_TASK');
      throws(() => f.command({ type: 'task.assign', taskId: 'one', assigneeAgentId: 'reviewer' }), 'TERMINAL_TASK');
      throws(() => f.command({ type: 'task.set_dependencies', taskId: 'one', dependsOn: [] }), 'TERMINAL_TASK');
    }
  });
  await t.test('blocked task needs an explicit authorized decision and satisfied dependencies to return ready', () => {
    const f = fixture([taskInput('one'), taskInput('two', { dependsOn: ['one'] })]); f.running();
    throws(() => f.transition('two', 'blocked'), 'DECISION_REQUIRED'); f.transition('two', 'blocked', 'Dependency unavailable');
    throws(() => f.transition('two', 'ready', 'Unblock'), 'DEPENDENCIES_NOT_COMPLETED');
    f.transition('one', 'working'); f.transition('one', 'completed'); assert.equal(f.task('two').status, 'blocked');
    throws(() => f.transition('two', 'ready'), 'DECISION_REQUIRED');
    throws(() => f.transition('two', 'ready', 'Unblock', 'stranger'), 'ACTOR_NOT_AUTHORIZED');
    f.transition('two', 'ready', 'Dependency resolved'); f.transition('two', 'working');
  });
  await t.test('review-required work cannot skip review or treat needs_review as working', () => {
    const f = fixture([taskInput('one', { requiresReview: true })]); f.running(); f.transition('one', 'working');
    throws(() => f.transition('one', 'completed'), 'REVIEW_REQUIRED'); f.transition('one', 'needs_review');
    throws(() => f.transition('one', 'working'), 'INVALID_TASK_TRANSITION');
    throws(() => f.command({ type: 'task.assign', taskId: 'one', assigneeAgentId: 'other' }), 'INVALID_ASSIGNMENT');
    f.transition('one', 'ready', 'Review requested rework'); f.transition('one', 'working'); f.transition('one', 'needs_review'); f.transition('one', 'completed');
  });
  await t.test('failed task retry is explicit and clears the previous completion time', () => {
    const f = fixture([taskInput('one')]); f.running(); f.transition('one', 'working'); const start = f.task('one').startedAt;
    f.transition('one', 'failed', 'Tests failed'); assert.ok(f.task('one').completedAt);
    throws(() => f.transition('one', 'ready'), 'DECISION_REQUIRED'); f.transition('one', 'ready', 'Retry approved');
    assert.equal(f.task('one').completedAt, null); f.transition('one', 'working'); assert.equal(f.task('one').startedAt, start);
  });
  await t.test('review pending cannot release a dependent task; approval releases it once', () => {
    const f = fixture([taskInput('reviewed', { requiresReview: true }), taskInput('next', { dependsOn: ['reviewed'] })]);
    f.running(); f.transition('reviewed', 'working'); f.transition('reviewed', 'needs_review');
    assert.equal(f.task('next').status, 'planned'); throws(() => f.transition('next', 'ready'), 'DEPENDENCIES_NOT_COMPLETED');
    f.transition('reviewed', 'completed');
    assert.equal(f.events.filter(event => event.type === 'task.ready' && event.taskId === 'next').length, 1);
  });
  await t.test('single-agent reassignment is audited and delegator is not changed', () => {
    const f = fixture([taskInput('one')]);
    throws(() => f.command({ type: 'task.assign', taskId: 'one', assigneeAgentId: ['developer', 'tester'] }), 'INVALID_INPUT');
    const result = f.command({ type: 'task.assign', taskId: 'one', assigneeAgentId: 'tester' });
    assert.equal(f.task('one').assigneeAgentId, 'tester'); assert.equal(f.task('one').delegatorAgentId, 'lead');
    assert.equal(result.events[0].type, 'task.assigned'); assert.equal(result.events[0].previousAgentId, 'developer'); assert.equal(result.events[0].agentId, 'tester');
    f.running(); f.transition('one', 'working', undefined, 'tester');
    throws(() => f.command({ type: 'task.assign', taskId: 'one', assigneeAgentId: 'lead' }), 'INVALID_ASSIGNMENT');
  });
  await t.test('Organizer alone completes the run, after all required tasks, never automatically', () => {
    const f = fixture([taskInput('one')]); f.running();
    throws(() => f.command({ type: 'run.transition', status: 'completed' }, 'developer'), 'ORGANIZER_REQUIRED');
    throws(() => f.command({ type: 'run.transition', status: 'completed' }), 'REQUIRED_TASKS_INCOMPLETE');
    f.transition('one', 'working'); f.transition('one', 'completed'); assert.equal(f.state.run.status, 'running');
    throws(() => f.command({ type: 'run.transition', status: 'completed' }, 'developer'), 'ORGANIZER_REQUIRED');
    const result = f.command({ type: 'run.transition', status: 'completed' });
    assert.equal(f.state.run.status, 'completed'); assert.ok(f.state.run.completedAt);
    assert.deepEqual(result.events.map(event => event.type), ['run.status_changed', 'run.completed']);
    assert.equal(result.events[1].agentId, 'lead');
  });
  await t.test('cancelled required work still blocks completion; optional tasks do not bypass active-work check', () => {
    const required = fixture([taskInput('one')]); required.running(); required.transition('one', 'cancelled', 'Cannot do it');
    throws(() => required.command({ type: 'run.transition', status: 'completed' }), 'REQUIRED_TASKS_INCOMPLETE');
    const optional = fixture([taskInput('one', { required: false })]); optional.running(); optional.transition('one', 'working');
    throws(() => optional.command({ type: 'run.transition', status: 'completed' }), 'ACTIVE_TASKS_REMAIN');
    optional.transition('one', 'cancelled', 'Not required'); optional.command({ type: 'run.transition', status: 'completed' });
    const skipped = fixture([taskInput('one', { required: false })]); skipped.running(); skipped.command({ type: 'run.transition', status: 'completed' });
  });
  await t.test('planning/running/waiting_input transitions are explicit and invalid run jumps throw', () => {
    const f = fixture(); throws(() => f.command({ type: 'run.transition', status: 'completed' }), 'INVALID_RUN_TRANSITION');
    f.command({ type: 'run.transition', status: 'waiting_input' }); f.command({ type: 'run.transition', status: 'planning' });
    f.running(); f.command({ type: 'run.transition', status: 'waiting_input' }); f.running();
    throws(() => f.command({ type: 'run.transition', status: 'planning' }), 'INVALID_RUN_TRANSITION');
  });
  await t.test('failed/cancelled runs stop remaining tasks and cannot be reopened', () => {
    for (const status of ['failed', 'cancelled']) {
      const f = fixture([taskInput('done'), taskInput('working'), taskInput('planned', { dependsOn: ['working'] })]);
      f.running(); f.transition('done', 'working'); f.transition('done', 'completed'); f.transition('working', 'working');
      throws(() => f.command({ type: 'run.transition', status }), 'DECISION_REQUIRED');
      const result = f.command({ type: 'run.transition', status, reason: 'Organizer decision' });
      assert.deepEqual(f.state.tasks.map(task => task.status), ['completed', 'cancelled', 'cancelled']);
      assert.equal(result.events.at(-1).type, 'run.' + status); assert.equal(result.events.at(-1).reason, 'Organizer decision');
      throws(() => f.running(), 'TERMINAL_RUN'); throws(() => f.command({ type: 'tasks.create', tasks: [taskInput('another')] }), 'TERMINAL_RUN');
    }
  });
  await t.test('plan versions preserve earlier snapshots and only Organizer revises a valid graph selection', () => {
    const f = fixture([taskInput('one'), taskInput('two', { dependsOn: ['one'] })]);
    throws(() => f.command({ type: 'plan.revise', summary: 'No plan', taskIds: ['one', 'two'] }), 'INVALID_PLAN');
    throws(() => f.command({ type: 'plan.create', id: 'plan', summary: 'Plan', taskIds: ['one', 'two'] }, 'developer'), 'ORGANIZER_REQUIRED');
    for (const taskIds of [['one'], ['two'], ['one', 'one'], ['missing']]) assert.throws(() => f.command({ type: 'plan.create', id: 'plan', summary: 'Plan', taskIds }), OrchestrationError);
    f.command({ type: 'plan.create', id: 'plan', summary: 'Initial plan', taskIds: ['one', 'two'] }); const old = f.state.plans[0];
    const result = f.command({ type: 'plan.revise', summary: 'Revised plan', taskIds: ['two', 'one'] });
    assert.equal(f.state.plans[1].id, old.id); assert.equal(f.state.plans[1].version, 2); assert.equal(old.version, 1); assert.equal(old.summary, 'Initial plan');
    assert.equal(result.events[0].type, 'plan.revised'); assert.equal(result.events[0].previousVersion, 1); assert.equal(result.events[0].plan.createdByAgentId, 'lead');
  });
  await t.test('domain results are deterministic, deeply immutable and do not freeze caller data', () => {
    const first = createTeamRun(runInput, fixedDecision), second = createTeamRun(runInput, fixedDecision); assert.deepEqual(first, second);
    const tasks = [taskInput('one')], command = { type: 'tasks.create', tasks };
    const result = apply(first.state, command, fixedDecision); assert.deepEqual(result, apply(first.state, command, fixedDecision));
    assert.deepEqual(first.state.tasks, []); assert.equal(Object.isFrozen(tasks), false);
    tasks[0].dependsOn.push('caller-change'); assert.deepEqual(result.state.tasks[0].dependsOn, []);
    assert.throws(() => { result.state.tasks[0].status = 'completed'; }, TypeError);
    assert.throws(() => result.state.tasks[0].dependsOn.push('changed'), TypeError);
    assert.throws(() => { result.events[0].task.title = 'changed'; }, TypeError);
    assert.equal(new Set(result.events.map(event => event.id)).size, result.events.length);
    for (const event of result.events) { assert.equal(event.runId, 'run'); assert.equal(event.occurredAt, fixedDecision.occurredAt); assert.equal(event.actorAgentId, 'lead'); }
  });
  await t.test('invalid scalar assignments, missing delegator identity, time reversal and unknown commands fail typed', () => {
    const f = fixture();
    for (const assigneeAgentId of ['', ' ', null, ['one', 'two']]) throws(() => f.command({ type: 'tasks.create', tasks: [taskInput('one', { assigneeAgentId })] }), 'INVALID_INPUT');
    throws(() => apply(f.state, { type: 'tasks.create', tasks: [taskInput('one')] }, { ...fixedDecision, agentId: '' }), 'INVALID_INPUT');
    throws(() => apply(f.state, { type: 'run.transition', status: 'running' }, fixedDecision), 'TIME_ORDER');
    throws(() => f.command({ type: 'unknown' }), 'INVALID_INPUT');
    throws(() => f.command({ type: 'task.transition', taskId: 'missing', status: 'ready' }), 'TASK_NOT_FOUND');
    throws(() => createTeamRun({ ...runInput, organizerAgentId: 'other' }, fixedDecision), 'ORGANIZER_REQUIRED');
  });
  await t.test('all requested event variants carry their common and agent/task payloads', () => {
    const f = fixture([taskInput('one', { requiresReview: true })]);
    f.command({ type: 'plan.create', id: 'plan', summary: 'Plan', taskIds: ['one'] });
    f.command({ type: 'plan.revise', summary: 'Revision', taskIds: ['one'] });
    f.command({ type: 'task.assign', taskId: 'one', assigneeAgentId: 'tester' }); f.running();
    f.transition('one', 'working', undefined, 'tester'); f.transition('one', 'blocked', 'Need input');
    f.transition('one', 'ready', 'Input provided'); f.transition('one', 'working', undefined, 'tester');
    f.transition('one', 'failed', 'Test failed'); f.transition('one', 'ready', 'Retry approved');
    f.transition('one', 'working', undefined, 'tester'); f.transition('one', 'needs_review'); f.transition('one', 'completed');
    f.command({ type: 'run.transition', status: 'completed' });
    const events = [...f.events];
    for (const status of ['failed', 'cancelled']) {
      const another = fixture([taskInput('other')]); another.command({ type: 'run.transition', status, reason: 'Stop run' }); events.push(...another.events);
    }
    assert.deepEqual([...new Set(events.map(event => event.type))].sort(), [
      'run.created', 'run.status_changed', 'plan.created', 'plan.revised', 'task.created', 'task.ready', 'task.assigned',
      'task.started', 'task.blocked', 'task.needs_review', 'task.completed', 'task.failed', 'task.cancelled', 'run.completed', 'run.failed', 'run.cancelled',
    ].sort());
    for (const event of events) {
      assert.equal(typeof event.id, 'string'); assert.equal(event.runId, 'run'); assert.ok(Number.isFinite(Date.parse(event.occurredAt)));
      assert.equal(typeof event.actorAgentId, 'string'); assert.equal(typeof event.agentId, 'string');
      if (event.type.startsWith('task.')) assert.equal(typeof event.taskId, 'string');
    }
  });
});
