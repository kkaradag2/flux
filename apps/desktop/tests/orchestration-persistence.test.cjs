'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');

test('Orchestration aggregate persistence', async t => {
  const temporaryRoot = path.join(root, '.cache/orchestration-persistence-tests');
  await fs.mkdir(temporaryRoot, { recursive: true });
  const output = await fs.mkdtemp(path.join(temporaryRoot, 'run-'));
  async function remove(directory) {
    const relative = path.relative(temporaryRoot, path.resolve(directory));
    assert.ok(relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
    await fs.rm(directory, { recursive: true, force: true });
  }
  t.after(() => remove(output));
  for (const directory of ['shared', 'domain/orchestration', 'application/orchestration', 'application/orchestration/organizer', 'application/orchestration/execution', 'main/orchestration', 'main/persistence']) {
    await fs.mkdir(path.join(output, directory), { recursive: true });
    for (const file of await fs.readdir(path.join(root, 'apps/desktop/src', directory))) {
      if (!file.endsWith('.ts')) continue;
      const source = await fs.readFile(path.join(root, 'apps/desktop/src', directory, file), 'utf8');
      await fs.writeFile(path.join(output, directory, file.replace(/\.ts$/, '.js')), ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      }).outputText);
    }
  }
  const { JsonOrchestrationRepository } = require(path.join(output, 'main/orchestration/JsonOrchestrationRepository'));
  const { createOrchestrationRepository } = require(path.join(output, 'main/orchestration/createOrchestrationRepository'));
  const { AtomicFileWriter } = require(path.join(output, 'main/persistence/AtomicFileWriter'));
  const { PersistedOrchestration } = require(path.join(output, 'application/orchestration/PersistedOrchestration'));
  const { OrchestrationPersistenceError } = require(path.join(output, 'application/orchestration/OrchestrationPersistenceError'));
  const { createTeamRun, applyOrchestrationCommand, OrchestrationError } = require(path.join(output, 'domain/orchestration'));
  const when = '2026-09-15T12:00:00.000Z';
  const decision = (id, extra = {}) => ({ id, agentId: 'lead', occurredAt: when, ...extra });
  const input = (id = 'run', conversationId = 'conversation') => ({ id, conversationId, projectId: 'project', teamId: 'team', organizerAgentId: 'lead', goal: 'Deliver feature' });
  const task = (id, dependsOn = []) => ({ id, title: id, description: 'Implement ' + id, ownerAgentId: 'developer', dependsOn, acceptanceCriteria: ['Tests pass']});
  const failure = code => error => error instanceof OrchestrationPersistenceError && error.code === code;
  async function fixture(subtest) {
    const directory = await fs.mkdtemp(path.join(output, 'case-')); subtest.after(() => remove(directory));
    const userData = path.join(directory, 'userData'), project = path.join(directory, 'project'), worktree = path.join(directory, 'worktree');
    await Promise.all([userData, project, worktree].map(value => fs.mkdir(value)));
    const location = { userDataDirectory: userData, excludedDirectories: [project, worktree] };
    const repository = new JsonOrchestrationRepository(location), service = new PersistedOrchestration(repository);
    return { directory, userData, project, worktree, location, repository, service,
      file: (id = 'run') => path.join(userData, 'orchestration', createHash('sha256').update(id).digest('hex') + '.json'),
      initialize: (id = 'run', conversationId = 'conversation') => service.createRun(input(id, conversationId), decision(id + '-created')),
      plan: () => service.applyBatch('run', [
        { command: { type: 'tasks.create', tasks: [task('build'), task('test', ['build'])] }, decision: decision('tasks') },
        { command: { type: 'plan.create', id: 'plan', summary: 'Initial plan', taskIds: ['build', 'test'] }, decision: decision('plan') },
      ]),
    };
  }
  await t.test('run and first event are atomically stored and rehydrate in a new repository instance', async t => {
    const f = await fixture(t), saved = await f.initialize();
    assert.equal(saved.revision, 1); const raw = JSON.parse(await fs.readFile(f.file(), 'utf8'));
    assert.equal(raw.schemaVersion, 2); assert.equal(raw.run.id, 'run'); assert.deepEqual(raw.plans, []); assert.deepEqual(raw.tasks, []); assert.equal(raw.events[0].type, 'run.created');
    const restarted = new JsonOrchestrationRepository(f.location);
    assert.deepEqual(await restarted.rehydrate('run'), saved); assert.deepEqual(await restarted.getRun('run'), saved.state.run);
    await assert.rejects(f.initialize(), failure('ALREADY_EXISTS')); assert.equal((await f.repository.getEvents('run')).length, 1);
    assert.deepEqual(await fs.readdir(path.dirname(f.file())), [path.basename(f.file())]);
  });
  await t.test('plan, batch tasks, dependencies and all events persist in one snapshot', async t => {
    const f = await fixture(t); await f.initialize(); const saved = await f.plan();
    assert.equal(saved.revision, 2); assert.equal(saved.currentPlan.version, 1);
    assert.deepEqual(saved.state.tasks[1].dependsOn, ['build']); assert.equal(saved.state.tasks[1].status, 'planned');
    assert.deepEqual(saved.events.map(event => event.type), ['run.created', 'task.created', 'task.created', 'task.ready', 'plan.created']);
    assert.deepEqual(await new JsonOrchestrationRepository(f.location).rehydrate('run'), saved);
    assert.deepEqual(await f.repository.getTasks('run'), saved.state.tasks);
  });
  await t.test('latest plan comes from highest version and historical versions remain intact', async t => {
    const f = await fixture(t); await f.initialize(); const initial = await f.plan();
    await f.service.apply('run', { type: 'plan.revise', summary: 'Version two', taskIds: ['test', 'build'] }, decision('revision-two'));
    await f.service.apply('run', { type: 'plan.revise', summary: 'Version three', taskIds: ['build', 'test'] }, decision('revision-three'));
    const raw = JSON.parse(await fs.readFile(f.file(), 'utf8')); raw.plans.reverse(); await fs.writeFile(f.file(), JSON.stringify(raw));
    const loaded = await new JsonOrchestrationRepository(f.location).rehydrate('run');
    assert.deepEqual(loaded.state.plans.map(plan => plan.version), [1, 2, 3]); assert.deepEqual(loaded.state.plans[0], initial.currentPlan);
    assert.equal((await f.repository.getCurrentPlan('run')).summary, 'Version three');
  });
  await t.test('events load chronologically with stable order for equal timestamps, including ISO offsets', async t => {
    const f = await fixture(t); await f.initialize(); await f.plan();
    await f.service.apply('run', { type: 'run.transition', status: 'running' }, decision('running', { occurredAt: '2026-09-15T16:00:00.000+03:00' }));
    const raw = JSON.parse(await fs.readFile(f.file(), 'utf8')); const later = raw.events.pop(); raw.events.unshift(later); await fs.writeFile(f.file(), JSON.stringify(raw));
    const events = await f.repository.getEvents('run'); assert.equal(events.at(-1).id, later.id);
    assert.deepEqual(events.slice(0, -1).map(event => event.type), ['run.created', 'task.created', 'task.created', 'task.ready', 'plan.created']);
    assert.equal(events.at(-1).occurredAt, '2026-09-15T16:00:00.000+03:00');
  });
  await t.test('duplicate event IDs are rejected against history and within one append', async t => {
    const f = await fixture(t), saved = await f.initialize(), original = await fs.readFile(f.file(), 'utf8');
    await assert.rejects(f.repository.save({ state: saved.state, events: [saved.events[0]] }, saved.revision), failure('DUPLICATE_EVENT'));
    const change = applyOrchestrationCommand(saved.state, { type: 'run.transition', status: 'running' }, decision('start'));
    await assert.rejects(f.repository.save({ state: change.state, events: [...change.events, ...change.events] }, saved.revision), failure('DUPLICATE_EVENT'));
    assert.equal(await fs.readFile(f.file(), 'utf8'), original);
  });
  await t.test('duplicate plan version or overwrite is rejected while unchanged history may be retained', async t => {
    const f = await fixture(t); await f.initialize(); const saved = await f.plan(), original = await fs.readFile(f.file(), 'utf8');
    const planEvent = saved.events.find(event => event.type === 'plan.created');
    await assert.rejects(f.repository.save({ state: saved.state, events: [{ ...planEvent, id: 'new-event-same-plan' }] }, saved.revision), failure('DUPLICATE_PLAN_VERSION'));
    await assert.rejects(f.repository.save({ state: { ...saved.state, plans: [...saved.state.plans, saved.currentPlan] }, events: [] }, saved.revision), failure('DUPLICATE_PLAN_VERSION'));
    await assert.rejects(f.repository.save({ state: { ...saved.state, plans: [{ ...saved.currentPlan, summary: 'overwrite' }] }, events: [] }, saved.revision), failure('DUPLICATE_PLAN_VERSION'));
    assert.equal(await fs.readFile(f.file(), 'utf8'), original);
    await f.service.apply('run', { type: 'task.assign', taskId: 'build', ownerAgentId: 'tester' }, decision('assign'));
    assert.deepEqual((await f.repository.rehydrate('run')).currentPlan, saved.currentPlan);
  });
  await t.test('concurrent updates through different instances retain both tasks and their events', async t => {
    const f = await fixture(t); await f.initialize(); await f.plan();
    const other = new PersistedOrchestration(new JsonOrchestrationRepository(f.location));
    await Promise.all([
      f.service.apply('run', { type: 'task.assign', taskId: 'build', ownerAgentId: 'builder-two' }, decision('assign-build')),
      other.apply('run', { type: 'task.assign', taskId: 'test', ownerAgentId: 'tester-two' }, decision('assign-test')),
    ]);
    const saved = await f.repository.rehydrate('run'); assert.equal(saved.revision, 4);
    assert.deepEqual(saved.state.tasks.map(task => task.ownerAgentId), ['builder-two', 'tester-two']);
    assert.equal(saved.events.filter(event => event.type === 'task.assigned').length, 2); JSON.parse(await fs.readFile(f.file(), 'utf8'));
  });
  await t.test('stale snapshots fail with a revision conflict instead of losing a completed write', async t => {
    const f = await fixture(t); await f.initialize(); const saved = await f.plan();
    const one = applyOrchestrationCommand(saved.state, { type: 'task.assign', taskId: 'build', ownerAgentId: 'another' }, decision('one'));
    const two = applyOrchestrationCommand(saved.state, { type: 'task.assign', taskId: 'test', ownerAgentId: 'another' }, decision('two'));
    await f.repository.save(one, saved.revision);
    await assert.rejects(f.repository.save(two, saved.revision), failure('REVISION_CONFLICT'));
    assert.equal((await f.repository.getTasks('run'))[0].ownerAgentId, 'another');
    assert.equal((await f.repository.getTasks('run'))[1].ownerAgentId, 'developer');
  });
  await t.test('task transition and dependency promotion events commit together; timestamps hydrate as domain strings', async t => {
    const f = await fixture(t); await f.initialize(); await f.plan();
    await f.service.applyBatch('run', [
      { command: { type: 'run.transition', status: 'running' }, decision: decision('running') },
      { command: { type: 'task.transition', taskId: 'build', status: 'working' }, decision: decision('work', { agentId: 'developer', occurredAt: '2026-09-15T12:01:00.000Z' }) },
      { command: { type: 'task.transition', taskId: 'build', status: 'completed' }, decision: decision('done', { occurredAt: '2026-09-15T12:02:00.000Z' }) },
    ]);
    const restored = await new JsonOrchestrationRepository(f.location).rehydrate('run');
    assert.equal(restored.revision, 3); assert.equal(restored.state.tasks[0].startedAt, '2026-09-15T12:01:00.000Z');
    assert.equal(restored.state.tasks[0].completedAt, '2026-09-15T12:02:00.000Z'); assert.equal(restored.state.tasks[1].startedAt, null);
    assert.equal(typeof restored.state.run.createdAt, 'string'); assert.equal(restored.state.run.completedAt, null);
    assert.deepEqual(restored.events.slice(-2).map(event => event.type), ['task.completed', 'task.ready']);
    assert.equal(restored.state.tasks[1].status, 'ready'); assert.equal(Object.isFrozen(restored.state.tasks[0]), true);
    assert.throws(() => { restored.state.tasks[0].status = 'working'; }, TypeError);
  });
  for (const stage of ['write', 'sync', 'rename']) await t.test(stage + ' failure preserves previous snapshot, removes temp and releases queue', async t => {
    const f = await fixture(t); await f.initialize(); const original = await fs.readFile(f.file(), 'utf8');
    const operations = { ...fs, open: async (...args) => {
      const handle = await fs.open(...args);
      return { writeFile: async (...args) => { if (stage === 'write') throw Error('fixture write failure'); return handle.writeFile(...args); },
        sync: async () => { if (stage === 'sync') throw Error('fixture sync failure'); return handle.sync(); }, close: () => handle.close() };
    }, rename: async (...args) => { if (stage === 'rename') throw Error('fixture rename failure'); return fs.rename(...args); } };
    const failing = new PersistedOrchestration(new JsonOrchestrationRepository(f.location, new AtomicFileWriter(operations)));
    await assert.rejects(failing.apply('run', { type: 'run.transition', status: 'running' }, decision('failed-write')), failure('WRITE_FAILED'));
    assert.equal(await fs.readFile(f.file(), 'utf8'), original);
    assert.deepEqual(await fs.readdir(path.dirname(f.file())), [path.basename(f.file())]);
    await f.service.apply('run', { type: 'run.transition', status: 'running' }, decision('retry'));
    assert.equal((await f.repository.getRun('run')).status, 'running');
  });
  await t.test('bad second command aborts the entire plan/task batch with no partial snapshot', async t => {
    const f = await fixture(t); await f.initialize(); const before = await fs.readFile(f.file(), 'utf8');
    await assert.rejects(f.service.applyBatch('run', [
      { command: { type: 'tasks.create', tasks: [task('new-task')] }, decision: decision('tasks') },
      { command: { type: 'plan.create', id: 'bad-plan', summary: 'Bad plan', taskIds: ['missing'] }, decision: decision('plan') },
    ]), OrchestrationError);
    assert.equal(await fs.readFile(f.file(), 'utf8'), before); assert.deepEqual(await f.repository.getTasks('run'), []);
  });
  for (const [kind, code, edit] of [
    ['broken JSON', 'CORRUPT_JSON', () => '{not json'],
    ['unsupported schema', 'UNSUPPORTED_SCHEMA', raw => JSON.stringify({ ...raw, schemaVersion: 99 })],
    ['invalid date', 'INVALID_RECORD', raw => JSON.stringify({ ...raw, run: { ...raw.run, createdAt: 'not a date' } })],
    ['invalid calendar date', 'INVALID_RECORD', raw => JSON.stringify({ ...raw, run: { ...raw.run, createdAt: '2026-02-31T00:00:00.000Z' } })],
    ['unknown event', 'INVALID_RECORD', raw => JSON.stringify({ ...raw, events: [{ ...raw.events[0], type: 'untrusted' }] })],
  ]) await t.test(kind + ' raises a typed error without replacing the file', async t => {
    const f = await fixture(t); await f.initialize(); const raw = JSON.parse(await fs.readFile(f.file(), 'utf8')), content = edit(raw); await fs.writeFile(f.file(), content);
    await assert.rejects(f.repository.rehydrate('run'), failure(code)); await assert.rejects(f.initialize(), failure(code));
    assert.equal(await fs.readFile(f.file(), 'utf8'), content);
  });
  await t.test('conversation queries return only its runs and the latest active run; missing reads do not seed data', async t => {
    const f = await fixture(t);
    assert.deepEqual(await f.repository.listRuns('conversation'), []); assert.equal(await f.repository.getActiveRun('conversation'), null);
    await assert.rejects(f.repository.rehydrate('missing'), failure('NOT_FOUND')); assert.deepEqual(await fs.readdir(f.userData), []);
    await f.initialize('one'); await f.initialize('two'); await f.initialize('foreign', 'other-conversation');
    await f.service.apply('two', { type: 'run.transition', status: 'waiting_input' }, decision('wait', { occurredAt: '2026-09-15T13:00:00.000Z' }));
    assert.deepEqual((await f.repository.listRuns('conversation')).map(run => run.id), ['two', 'one']);
    assert.equal((await f.repository.getActiveRun('conversation')).state.run.id, 'two');
    await f.service.apply('two', { type: 'run.transition', status: 'cancelled', reason: 'Done waiting' }, decision('cancel', { occurredAt: '2026-09-15T13:00:00.000Z' }));
    assert.equal((await f.repository.getActiveRun('conversation')).state.run.id, 'one');
    const restored = await f.repository.rehydrate('two'); assert.equal(restored.state.run.status, 'cancelled'); assert.equal(restored.events.at(-1).type, 'run.cancelled');
  });
  await t.test('one run write or corruption cannot modify or prevent ID loading of another', async t => {
    const f = await fixture(t); await f.initialize('one'); await f.initialize('two'); const original = await fs.readFile(f.file('two'), 'utf8');
    await f.service.apply('one', { type: 'run.transition', status: 'failed', reason: 'Failure' }, decision('fail'));
    assert.equal(await fs.readFile(f.file('two'), 'utf8'), original); await fs.writeFile(f.file('one'), '{broken');
    assert.equal((await f.repository.rehydrate('two')).state.run.id, 'two'); assert.equal(await fs.readFile(f.file('two'), 'utf8'), original);
  });
  await t.test('only userData/orchestration is used; project/worktree paths and redirects are rejected', async t => {
    const f = await fixture(t); const calls = [];
    const repository = createOrchestrationRepository({ getPath: name => { calls.push(name); return f.userData; } }, [f.project, f.worktree]);
    await repository.create(createTeamRun(input(), decision('create'))); assert.deepEqual(calls, ['userData']);
    assert.deepEqual(await fs.readdir(f.project), []); assert.deepEqual(await fs.readdir(f.worktree), []);
    for (const userDataDirectory of [f.project, path.join(f.project, 'data'), f.worktree, path.join(f.worktree, 'data')]) {
      const unsafe = new JsonOrchestrationRepository({ ...f.location, userDataDirectory });
      await assert.rejects(unsafe.create(createTeamRun(input(), decision('create'))), failure('UNSAFE_LOCATION'));
    }
    const redirected = path.join(f.directory, 'redirected-profile'); await fs.symlink(f.project, redirected, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(new JsonOrchestrationRepository({ ...f.location, userDataDirectory: redirected }).create(createTeamRun(input(), decision('create'))), failure('UNSAFE_LOCATION'));
    const second = path.join(f.directory, 'another-profile'); await fs.mkdir(second); await fs.symlink(f.project, path.join(second, 'orchestration'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(new JsonOrchestrationRepository({ ...f.location, userDataDirectory: second }).create(createTeamRun(input(), decision('create'))), failure('UNSAFE_LOCATION'));
    assert.deepEqual(await fs.readdir(f.project), []); assert.deepEqual(await fs.readdir(f.worktree), []);
  });
  await t.test('run IDs are encoded into filenames, never interpreted as paths; copied records cannot impersonate another ID', async t => {
    const f = await fixture(t), id = '../path/with:characters'; await f.initialize(id);
    assert.deepEqual(await fs.readdir(path.join(f.userData, 'orchestration')), [path.basename(f.file(id))]); assert.equal((await f.repository.getRun(id)).id, id);
    await fs.copyFile(f.file(id), f.file('other'));
    await assert.rejects(f.repository.getRun('other'), failure('INVALID_RECORD'));
  });
  await t.test('schema v1 migrates atomically without losing failed attempts, owner, normal Reviewer task or history', async t => {
    const f = await fixture(t); await f.initialize();
    await f.service.apply('run', {type:'plan.initialize',id:'plan',summary:'Work',tasks:[task('developer'),{...task('tester',['developer']),ownerAgentId:'tester'},{...task('reviewer',['tester']),title:'Review signup implementation',ownerAgentId:'reviewer'}]},decision('initial'));
    await f.service.apply('run',{type:'task.transition',taskId:'developer',status:'working'},decision('start',{agentId:'developer'}));
    await f.service.apply('run',{type:'task.finish',taskId:'developer',status:'failed',failure:'VALIDATION_FAILED',reason:'VALIDATION_FAILED',report:{summary:'Preparation failed',evidence:[],changedFiles:[],durationMs:1,agentName:'Developer'}},decision('fail',{agentId:'developer'}));
    const canonical=JSON.parse(await fs.readFile(f.file(),'utf8'));
    function legacy(value){if(Array.isArray(value))return value.map(legacy);if(!value||typeof value!=='object')return value;const result={};for(const [key,item]of Object.entries(value))result[key==='ownerAgentId'?'assigneeAgentId':key]=legacy(item);if('delegatorAgentId'in value&&'title'in value){result.requiresReview=true;result.reviewerAgentId='reviewer'}return result;}
    const old={...legacy(canonical),schemaVersion:1};await fs.writeFile(f.file(),JSON.stringify(old));
    let writes=0;const writer=new AtomicFileWriter(),repo=new JsonOrchestrationRepository(f.location,{write:async(...args)=>{writes++;await writer.write(...args)}});
    const first=await repo.rehydrate('run'),bytes=await fs.readFile(f.file(),'utf8');assert.equal(writes,1);assert.equal(JSON.parse(bytes).schemaVersion,2);
    assert.deepEqual(first.state.tasks,canonical.tasks);assert.deepEqual(first.currentPlan.taskIds,['developer','tester','reviewer']);assert.equal(first.state.tasks[0].status,'failed');assert.deepEqual(first.state.tasks[0].attempts,canonical.tasks[0].attempts);
    assert.equal(first.state.tasks[2].title,'Review signup implementation');assert.equal(first.state.tasks[2].ownerAgentId,'reviewer');assert.ok(!JSON.stringify(first).includes('requiresReview'));assert.equal(first.events.length,old.events.length);
    assert.ok(JSON.parse(bytes).legacyEventMetadata.some(e=>e.fields['task.requiresReview']===true));assert.deepEqual(await repo.rehydrate('run'),first);assert.equal(writes,1);assert.equal(await fs.readFile(f.file(),'utf8'),bytes);
    const {retryableTask}=require(path.join(output,'domain/orchestration/taskAttempts'));assert.equal(retryableTask(first.state.tasks[0]),false);
    await repo.update('run',state=>({state,events:[]}));assert.deepEqual(JSON.parse(await fs.readFile(f.file(),'utf8')).legacyEventMetadata,JSON.parse(bytes).legacyEventMetadata);
  });
  await t.test('legacy pending status and events become needs_attention; failed migration retains original bytes',async t=>{
    const f=await fixture(t);await f.initialize();await f.service.apply('run',{type:'plan.initialize',id:'plan',summary:'Outcome',tasks:[task('one')]},decision('plan'));
    await f.service.apply('run',{type:'task.transition',taskId:'one',status:'working'},decision('start',{agentId:'developer'}));await f.service.apply('run',{type:'task.transition',taskId:'one',status:'needs_attention'},decision('attention',{agentId:'developer'}));
    const current=JSON.parse(await fs.readFile(f.file(),'utf8'));const text=JSON.stringify({...current,schemaVersion:1}).replaceAll('needs_attention','needs_review').replaceAll('ownerAgentId','assigneeAgentId');await fs.writeFile(f.file(),text);
    const failed=new JsonOrchestrationRepository(f.location,{write:async()=>{throw Error('fixture write failure')}});await assert.rejects(failed.rehydrate('run'),failure('WRITE_FAILED'));assert.equal(await fs.readFile(f.file(),'utf8'),text);
    const loaded=await f.repository.rehydrate('run');assert.equal(loaded.state.tasks[0].status,'needs_attention');assert.ok(loaded.events.some(e=>e.type==='task.needs_attention'));assert.ok(!JSON.stringify(loaded).includes('needs_review'));
  });

});
