const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), ts = require('typescript');
const { randomUUID } = require('node:crypto');

test('Organizer follow-up durable decisions', async t => {
 const root = path.resolve(__dirname, '../../..'), parent = path.join(root, '.cache/follow-up-tests');
 await fs.mkdir(parent, { recursive: true }); const base = await fs.mkdtemp(path.join(parent, 'run-'));
 t.after(async () => { assert.ok(path.resolve(base).startsWith(parent + path.sep)); await fs.rm(base, { recursive: true, force: true }); });
 async function compile(dir) {
  await fs.mkdir(path.join(base, dir), { recursive: true });
  for (const entry of await fs.readdir(path.join(root, 'apps/desktop/src', dir), { withFileTypes: true })) {
   if (entry.isDirectory()) { await compile(path.join(dir, entry.name)); continue; }
   if (!entry.name.endsWith('.ts') || entry.name.endsWith('.d.ts')) continue;
   await fs.writeFile(path.join(base, dir, entry.name.replace(/\.ts$/, '.js')), ts.transpileModule(await fs.readFile(path.join(root, 'apps/desktop/src', dir, entry.name), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText);
  }
 }
 for (const dir of ['domain', 'application', 'main/orchestration', 'main/app-server', 'main/persistence', 'main/chat', 'main/management', 'shared', 'preload']) await compile(dir);
 const load = file => require(path.join(base, file));
 const { JsonOrchestrationRepository } = load('main/orchestration/JsonOrchestrationRepository');
 const { createTeamRun, applyOrchestrationCommand } = load('domain/orchestration');
 const { OrganizerFollowUp } = load('application/orchestration/organizer/OrganizerFollowUp');
 const { validateFollowUpDecision } = load('application/orchestration/organizer/FollowUpDecision');
 const { AgentRuntimeRouter } = load('application/runtime/AgentRuntimeRouter');
 const { TaskExecutionCoordinator } = load('application/orchestration/execution/TaskExecutionCoordinator');
 const { AgentTaskExecutor } = load('application/orchestration/execution/AgentTaskExecutor');
 const { OrchestrationViews } = load('main/orchestration/OrchestrationViews');
 const { OrchestrationService } = load('main/orchestration/OrchestrationService');
 const { codexFollowUpSchema, decodeCodexFollowUp } = load('main/app-server/CodexFollowUpSchema');
 const clock = { newId: randomUUID, now: () => new Date().toISOString() };
 async function fixture(runtime = 'codex', status = 'needs_attention', session = true) {
  const runId = randomUUID(), location = { userDataDirectory: path.join(base, runId), excludedDirectories: [path.join(base, 'project')] };
  const repo = new JsonOrchestrationRepository(location), actor = agentId => ({ id: randomUUID(), agentId, occurredAt: clock.now() });
  await repo.create(createTeamRun({ id: runId, conversationId: 'conversation', projectId: 'project', teamId: 'team', organizerAgentId: 'lead', goal: 'Ship the feature C:/private/file token=secret' }, actor('lead')));
  const change = (cmd, who = 'lead') => repo.update(runId, state => applyOrchestrationCommand(state, cmd, actor(who)));
  await change({ type: 'run.set_organizer_session', session: { runtime, externalSessionId: 'organizer-private' } });
  await change({ type: 'plan.initialize', id: 'plan', summary: 'Build and verify', tasks: [
   { id: 'build', title: 'Build', description: 'Implement', ownerAgentId: 'dev', dependsOn: [], acceptanceCriteria: ['Works'] },
   { id: 'test', title: 'Verify', description: 'Verify', ownerAgentId: 'tester', dependsOn: ['build'], acceptanceCriteria: ['Works'] },
  ] });
  if (status !== 'ready') {
   await change({ type: 'task.transition', taskId: 'build', status: 'working' }, 'dev');
   if (session) await change({ type: 'task.set_session', taskId: 'build', session: { runtime, externalSessionId: 'task-private' } }, 'dev');
   if (status !== 'working') await change({ type: 'task.finish', taskId: 'build', status, reason: status === 'blocked' || status === 'failed' ? 'STOP' : undefined, report: { summary: 'Needs a decision', evidence: ['One check remains'], changedFiles: ['forged.txt'], durationMs: 1, agentName: 'Developer' } }, 'dev');
  }
  const agents = ['lead', 'dev', 'tester'].map(id => ({ id, name: id, description: id + ' purpose', instructions: id + ' PRIVATE instruction', enabled: true, runtime: { type: runtime, model: null, reasoningEffort: 'default' } }));
  const team = { id: 'team', organizerAgentId: 'lead', agentIds: agents.map(a => a.id) };
  const source = { getTeam: async () => team, getAgents: async () => agents, getProject: async () => ({ id: 'project', path: root }), getConversation: async () => ({ projectId: 'project', branchName: 'main' }), validate: async () => {}, validateTeam: async () => {} };
  const workspaces = { verifyReady: async () => ({ cwd: root }), changedFiles: async () => ['src/verified.ts'], prepare: async () => { throw Error('Must reuse'); } };
  let behavior = async () => ({ type: 'continue_task', taskId: 'build', guidance: 'Finish the remaining check.', message: 'Continue this task.' });
  const calls = [], adapter = { type: runtime, getCapabilities: () => ({ structuredOutput: true, persistentSessions: true, cancellation: true, sandboxing: true, workingDirectory: true, toolExecution: true }),
   runTurn: async request => { calls.push(request); await request.onSession?.(request.session); await request.onExecutionStarted?.(); return { value: await behavior(request), session: request.session, durationMs: 12 }; } };
  const router = new AgentRuntimeRouter([adapter]), follow = new OrganizerFollowUp(repo, source, router, workspaces, clock);
  const views = new OrchestrationViews({ getAgents: async () => agents });
  const tasks = new TaskExecutionCoordinator(repo, source, workspaces, new AgentTaskExecutor(router), clock, undefined, { check: async context => ({ ...(await workspaces.verifyReady(context.run, context.branch, context.projectPath)), runtimeIdentity: { sourceId: 'verified', version: '0.154.0' } }) });
  const service = new OrchestrationService(source, repo, {}, views, () => true, () => true, undefined, tasks, follow);
  return { repo, location, runId, source, agents, team, workspaces, calls, follow, router, tasks, service, views, change, behavior: fn => behavior = fn };
 }
 const signal = () => new AbortController().signal;
 const tick = () => new Promise(r => setImmediate(r));
 async function until(check) { for (let i = 0; i < 300; i++) { if (await check()) return; await new Promise(r => setTimeout(r, 5)); } assert.fail('Timed out'); }
 for (const runtime of ['codex', 'claude']) for (const status of ['needs_attention', 'blocked']) for (const type of ['continue_task', 'accept_result', 'ask_user']) await t.test(`${runtime} ${status}: ${type}`, async () => {
  const f = await fixture(runtime, status);
  f.behavior(async () => ({ type, taskId: 'build', message: 'Safe decision', ...(type === 'continue_task' ? { guidance: 'Finish check' } : type === 'ask_user' ? { questions: ['Which behavior?'] } : {}) }));
  await f.follow.request(f.runId, signal()); const saved = await f.repo.rehydrate(f.runId), item = saved.state.interventions[0];
  assert.equal(item.status, 'applied'); assert.equal(item.decision.type, type); assert.equal(item.durationMs, 12);
  assert.equal(saved.state.tasks[0].status, type === 'accept_result' ? 'completed' : status);
  assert.equal(saved.state.tasks[1].status, type === 'accept_result' ? 'ready' : 'planned');
  assert.equal(saved.state.run.status, type === 'ask_user' ? 'waiting_input' : 'running');
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].session.externalSessionId, 'organizer-private');
  assert.equal(f.calls[0].resultContract, 'organizer-follow-up'); assert.deepEqual(f.calls[0].policy, { readOnly: true, network: false, tools: false });
  assert.ok(f.calls[0].instructions.startsWith('lead PRIVATE instruction'));
  for (const secret of ['task-private', 'organizer-private', 'PRIVATE', 'C:/', 'token=secret', 'forged.txt']) assert.ok(!f.calls[0].prompt.includes(secret), secret);
  assert.deepEqual(JSON.parse(f.calls[0].prompt).task.changedFiles, ['src/verified.ts']);
  const restored = new JsonOrchestrationRepository(f.location); assert.deepEqual(await restored.rehydrate(f.runId), saved);
  await assert.rejects(f.follow.request(f.runId, signal())); assert.equal(f.calls.length, 1);
  await f.follow.apply(f.runId, item.id); assert.equal((await f.repo.rehydrate(f.runId)).events.length, saved.events.length);
 });
 for (const status of ['ready', 'working', 'completed', 'failed']) await t.test('reject non-attention ' + status, async () => { const f = await fixture('codex', status); await assert.rejects(f.follow.request(f.runId, signal())); assert.equal(f.calls.length, 0); });
 await t.test('wire envelope and semantic rules reject extras, wrong task, absent session and unbounded text', () => {
  assert.equal(codexFollowUpSchema.type, 'object'); assert.equal(codexFollowUpSchema.additionalProperties, false); assert.deepEqual(codexFollowUpSchema.required, Object.keys(codexFollowUpSchema.properties));
  for (const type of ['continue_task', 'accept_result', 'ask_user']) {
   const wire = { type, taskId: 'build', message: 'Proceed', guidance: type === 'continue_task' ? 'Finish' : '', questions: type === 'ask_user' ? ['Which?'] : [] };
   const decoded = decodeCodexFollowUp(JSON.stringify(wire)); assert.equal(validateFollowUpDecision(decoded, 'build', true).type, type);
   assert.throws(() => decodeCodexFollowUp(JSON.stringify({ ...wire, owner: 'other' })));
   assert.throws(() => validateFollowUpDecision(decoded, 'other', true));
  }
  const decision = { type: 'continue_task', taskId: 'build', message: 'Go', guidance: 'Finish' };
  assert.throws(() => validateFollowUpDecision(decision, 'build', false));
  assert.throws(() => validateFollowUpDecision({ ...decision, guidance: 'x'.repeat(4001) }, 'build', true));
  assert.throws(() => decodeCodexFollowUp(JSON.stringify({ type: 'accept_result', taskId: 'build', message: 'Fine', guidance: 'hidden', questions: [] })));
  assert.throws(() => validateFollowUpDecision({ type: 'ask_user', taskId: 'build', message: 'Ask', questions: ['1', '2', '3', '4'] }, 'build', true));
 });
 await t.test('no task session rejects continue without mutating task', async () => { const f = await fixture('codex', 'needs_attention', false); await assert.rejects(f.follow.request(f.runId, signal())); const state = (await f.repo.rehydrate(f.runId)).state; assert.equal(state.tasks[0].status, 'needs_attention'); assert.equal(state.interventions[0].status, 'failed'); });
 for (const mode of ['disabled', 'outside', 'session-mismatch']) await t.test('Organizer eligibility ' + mode, async () => { const f = await fixture(); if (mode === 'disabled') f.agents[0].enabled = false; if (mode === 'outside') f.team.agentIds = ['dev', 'tester']; if (mode === 'session-mismatch') f.agents[0].runtime.type = 'claude'; await assert.rejects(f.follow.request(f.runId, signal())); assert.equal(f.calls.length, 0); });
 await t.test('duplicate reservation, Working view, cancel race and terminal Idle', async () => {
  const f = await fixture(), c = new AbortController(); let finish;
  f.behavior(() => new Promise(resolve => finish = resolve)); const first = f.service.requestFollowUp(1, { runId: f.runId });
  assert.equal(first, f.service.requestFollowUp(1, { runId: f.runId })); await until(() => finish);
  const during = await f.views.project(await f.repo.rehydrate(f.runId)); assert.equal(during.followUp.evaluating, true); assert.equal(during.followUp.canAsk, false);
  assert.throws(() => f.service.execute(2, { runId: f.runId })); await assert.rejects(f.service.cancel(2, { runId: f.runId }));
  const stopped = f.service.cancel(1, { runId: f.runId }); await tick(); finish({ type: 'accept_result', taskId: 'build', message: 'Fine' });
  await assert.rejects(first); await stopped;
  const saved = await f.repo.rehydrate(f.runId); assert.equal(saved.state.interventions[0].status, 'cancelled'); assert.equal(saved.state.tasks[0].status, 'needs_attention');
  assert.equal((await f.views.project(saved)).followUp.evaluating, false); assert.equal(f.calls.length, 1);
 });
 await t.test('stale task revision cannot apply result', async () => {
  const f = await fixture(); let finish; f.behavior(() => new Promise(resolve => finish = resolve)); const operation = f.follow.request(f.runId, signal()); await until(() => finish);
  await f.change({ type: 'task.assign', taskId: 'build', ownerAgentId: 'tester' }); finish({ type: 'accept_result', taskId: 'build', message: 'Fine' }); await assert.rejects(operation);
  const saved = await f.repo.rehydrate(f.runId); assert.equal(saved.state.tasks[0].status, 'needs_attention'); assert.equal(saved.state.interventions[0].status, 'failed');
 });
 await t.test('continue prepares new attempt, same owner/session and guidance; no scheduler', async () => {
  const f = await fixture(); await f.follow.request(f.runId, signal()); const before = await f.repo.rehydrate(f.runId);
  f.behavior(async request => { assert.equal(request.session.externalSessionId, 'task-private'); assert.equal(JSON.parse(request.prompt).organizerGuidance, 'Finish the remaining check.'); assert.equal(request.instructions, ''); assert.equal(request.continuation,true); return { status: 'needs_attention', summary: 'Another result', evidence: [] }; });
  await f.service.execute(1, { runId: f.runId }, false, true); const saved = await f.repo.rehydrate(f.runId);
  assert.equal(saved.state.tasks[0].attempts.length, 2); assert.deepEqual(saved.state.tasks[0].attempts[0], before.state.tasks[0].attempts[0]); assert.equal(saved.state.tasks[0].ownerAgentId, 'dev'); assert.equal(saved.state.tasks[1].status, 'planned'); assert.equal(f.calls.length, 2);
  await assert.rejects(f.service.execute(1, { runId: f.runId }, false, true));
 });
 await t.test('ask_user answer routes same intervention and Organizer session through narrow API', async () => {
  const f = await fixture(); f.behavior(async () => ({ type: 'ask_user', taskId: 'build', message: 'Need input', questions: ['Which behavior?'] })); await f.follow.request(f.runId, signal());
  const before = await f.repo.rehydrate(f.runId); f.behavior(async request => { assert.equal(JSON.parse(request.prompt).userAnswer, 'Use current behavior'); return { type: 'accept_result', taskId: 'build', message: 'Accepted' }; });
  await f.service.continue(1, { runId: f.runId, message: 'Use current behavior' }); const saved = await f.repo.rehydrate(f.runId);
  assert.equal(saved.state.interventions.length, 1); assert.equal(saved.state.interventions[0].id, before.state.interventions[0].id); assert.equal(saved.state.tasks[0].status, 'completed'); assert.equal(f.calls[1].session.externalSessionId, 'organizer-private');
 });
 for (const status of ['pending', 'decided']) await t.test(status + ' restart recovery is idempotent and never calls a model', async () => {
  const f = await fixture(), task = (await f.repo.getTasks(f.runId))[0]; const item = { id: 'intervention', taskId: 'build', sourceTaskRevision: task.revision, sourceResultRevision: 1, status: 'pending', decision: null, createdAt: clock.now(), updatedAt: clock.now() };
  await f.change({ type: 'intervention.record', intervention: item }); if (status === 'decided') await f.change({ type: 'intervention.record', intervention: { ...item, status, decision: { type: 'accept_result', taskId: 'build', message: 'Accepted' } } });
  const restored = new OrganizerFollowUp(new JsonOrchestrationRepository(f.location), f.source, f.router, f.workspaces, clock); await restored.recover(); const first = await f.repo.rehydrate(f.runId); await restored.recover(); assert.deepEqual(await f.repo.rehydrate(f.runId), first); assert.equal(f.calls.length, 0); assert.equal(first.state.interventions[0].status, status === 'pending' ? 'failed' : 'applied');
 });
 await t.test('IPC rejects renderer-selected task/owner/session and disposal cancels before invocation', async () => {
  const f = await fixture(); for (const field of ['taskId', 'owner', 'session', 'runtime', 'path', 'decision']) assert.throws(() => f.service.requestFollowUp(1, { runId: f.runId, [field]: 'injected' }));
  const pending = f.service.requestFollowUp(1, { runId: f.runId }); await f.service.closeOwner(1); await pending; assert.equal(f.calls.length, 0);
 });
 await t.test('Codex adapter selects follow-up wire schema and resumes exact session', async () => {
  const { CodexAgentRuntimeAdapter } = load('main/app-server/CodexAgentRuntimeAdapter'); let usedSchema, usedOptions;
  const adapter = new CodexAgentRuntimeAdapter({ resolve: async () => ({ structuredOutput: true, client: { createStructuredSession(schema, execution) { usedSchema = schema; assert.equal(execution, false); return { async turn(options) { usedOptions = options; await options.onThread('retained-session'); return JSON.stringify({ type: 'accept_result', taskId: 'build', message: 'Accepted', guidance: '', questions: [] }); }, async close() {} }; } } }) });
  const result = await adapter.runTurn({ resultContract: 'organizer-follow-up', session: { runtime: 'codex', externalSessionId: 'retained-session' }, signal: signal(), cwd: root, instructions: 'Keep instruction', prompt: '{}', settings: { model: null, reasoningEffort: 'default' }, policy: { readOnly: true, tools: false, network: false } });
  assert.deepEqual(usedSchema, codexFollowUpSchema); assert.equal(usedOptions.threadId, 'retained-session'); assert.equal(result.value.type, 'accept_result');
 });
 await t.test('questions persist in chat with Organizer attribution, deduplicate and restore', async () => {
  const f = await fixture(), { TeamConversationJournal } = load('main/orchestration/TeamConversationJournal');
  const record = { id: 'conversation', mode: 'team', leadAgentId: 'lead', messages: [], updatedAt: clock.now(), status: 'completed' };
  const journal = new TeamConversationJournal({ get: async () => structuredClone(record), save: async next => Object.assign(record, next) }, f.source, { getAgents: async () => f.agents });
  f.behavior(async () => ({ type: 'ask_user', taskId: 'build', message: 'Need input', questions: ['Which behavior?'] })); await f.follow.request(f.runId, signal());
  const saved = await f.repo.rehydrate(f.runId); await journal.sync(saved); await journal.sync(saved);
  const message = record.messages.find(message => message.content.includes('Which behavior?')); assert.equal(message.agentId, 'lead'); assert.equal(record.messages.filter(message => message.content.includes('Which behavior?')).length, 1);
  const restored = new JsonOrchestrationRepository(f.location); await journal.sync(await restored.rehydrate(f.runId)); assert.equal(record.messages.filter(message => message.content.includes('Which behavior?')).length, 1);
 });

 await t.test('safe text retains ordinary slash-separated checks and removes absolute locations', () => {
  const value = validateFollowUpDecision({type:'continue_task',taskId:'build',message:'Check typecheck/build',guidance:'Check typecheck/build, hide /opt/private and C:/private.'},'build',true);
  assert.ok(value.guidance.includes('typecheck/build')); assert.ok(!value.guidance.includes('/opt/')); assert.ok(!value.guidance.includes('C:/'));
 });
 for(const mode of ['session','unsafe-files','shutdown','completed-cancel']) await t.test('follow-up safety '+mode,async()=>{
  const f=await fixture();
  if(mode==='unsafe-files'){f.workspaces.changedFiles=async()=>['../private'];await assert.rejects(f.follow.request(f.runId,signal()));assert.equal(f.calls.length,0);return;}
  if(mode==='session'){f.behavior(async request=>{await request.onSession({runtime:'codex',externalSessionId:'replacement'});return{type:'accept_result',taskId:'build',message:'Fine'}});await assert.rejects(f.follow.request(f.runId,signal()));assert.equal((await f.repo.rehydrate(f.runId)).state.tasks[0].status,'needs_attention');return;}
  if(mode==='completed-cancel'){await f.service.requestFollowUp(1,{runId:f.runId});const before=await f.repo.rehydrate(f.runId);await f.service.cancel(1,{runId:f.runId});assert.deepEqual(await f.repo.rehydrate(f.runId),before);return;}
  let finish;f.behavior(()=>new Promise(resolve=>finish=resolve));const pending=f.service.requestFollowUp(1,{runId:f.runId});await until(()=>finish);const shutdown=f.service.shutdown();finish({type:'accept_result',taskId:'build',message:'Fine'});await assert.rejects(pending);await shutdown;assert.equal((await f.repo.rehydrate(f.runId)).state.interventions[0].status,'cancelled');
 });

 for(const outcome of ['completed','needs_attention','blocked']) await t.test('continuation '+outcome+' preserves intervention, session, history and promotes only satisfied dependencies',async()=>{
  const f=await fixture();await f.follow.request(f.runId,signal());const before=await f.repo.rehydrate(f.runId);let finish;
  f.behavior(request=>{assert.equal(request.continuation,true);assert.equal(request.instructions,'');assert.equal(request.session.externalSessionId,'task-private');const prompt=JSON.parse(request.prompt);assert.deepEqual(Object.keys(prompt).sort(),['constraints','organizerGuidance','taskId']);assert.equal(prompt.taskId,'build');assert.equal(prompt.organizerGuidance,'Finish the remaining check.');assert.equal(request.prompt.split(prompt.organizerGuidance).length-1,1);assert.ok(!request.prompt.includes('PRIVATE instruction'));assert.ok(prompt.constraints.some(text=>text.includes('local/offline')));return new Promise(resolve=>finish=resolve);});
  const first=f.service.execute(1,{runId:f.runId},false,true),second=f.service.execute(1,{runId:f.runId},false,true);assert.equal(first,second);await until(()=>finish);
  const active=await f.repo.rehydrate(f.runId),view=await f.views.project(active);assert.equal(active.state.tasks[0].attempts.length,2);assert.equal(view.execution.activeTaskId,'build');assert.equal(view.followUp.canContinueTask,false);assert.equal(view.run.status,'running');
  finish({status:outcome,summary:'Verified continuation '+outcome,evidence:['Checks recorded']});await first;
  const saved=await f.repo.rehydrate(f.runId);assert.equal(saved.state.tasks[0].status,outcome);assert.equal(saved.state.tasks[1].status,outcome==='completed'?'ready':'planned');assert.equal(f.calls.length,2);assert.deepEqual(saved.state.tasks[0].session,before.state.tasks[0].session);assert.deepEqual(saved.state.interventions,before.state.interventions);assert.deepEqual(saved.state.tasks[0].attempts[0],before.state.tasks[0].attempts[0]);assert.deepEqual(saved.state.tasks[0].execution.changedFiles,['src/verified.ts']);
  const restored=new JsonOrchestrationRepository(f.location);assert.deepEqual(await restored.rehydrate(f.runId),saved);await f.tasks.recover();assert.deepEqual(await restored.rehydrate(f.runId),saved);
  const {TeamConversationJournal}=load('main/orchestration/TeamConversationJournal');const record={id:'conversation',mode:'team',leadAgentId:'lead',messages:[],updatedAt:clock.now(),status:'completed'};
  const journal=new TeamConversationJournal({get:async()=>structuredClone(record),save:async value=>Object.assign(record,value)},f.source,{getAgents:async()=>f.agents});await journal.sync(before);await journal.sync(saved);await journal.sync(await restored.rehydrate(f.runId));assert.equal(record.messages.filter(m=>m.content.includes('Verified continuation')).length,1);assert.equal(record.messages.filter(m=>m.content.includes('Continue this task')).length,1);assert.equal(record.messages.filter(m=>m.superseded).length,1);
 });
 for(const invalid of ['pending','decided','stale-task','stale-result','missing-session','disabled-owner','outside-team','missing-guidance','preflight-fails','owner-race']) await t.test('continuation rejects before attempt: '+invalid,async()=>{
  const f=await fixture();await f.follow.request(f.runId,signal());const original=await f.repo.rehydrate(f.runId);
  let snapshot=structuredClone(original),checks=0;
  if(['pending','decided'].includes(invalid))snapshot.state.interventions[0].status=invalid;
  if(invalid==='stale-task')snapshot.state.tasks[0].revision++;
  if(invalid==='stale-result')snapshot.state.interventions[0].sourceResultRevision++;
  if(invalid==='missing-session')delete snapshot.state.tasks[0].session;
  if(invalid==='missing-guidance')snapshot.state.interventions[0].decision.guidance='';
  if(invalid==='disabled-owner')f.agents[1].enabled=false;
  if(invalid==='outside-team')f.team.agentIds=['lead','tester'];
  const repository=new Proxy(f.repo,{get(target,key){if(key==='rehydrate')return async()=>snapshot;const value=target[key];return typeof value==='function'?value.bind(target):value;}});
  const coordinator=new TaskExecutionCoordinator(repository,f.source,f.workspaces,new AgentTaskExecutor(f.router),clock,undefined,{check:async()=>{checks++;if(invalid==='preflight-fails')throw Error('Unsafe session');if(invalid==='owner-race')f.agents[1]={...f.agents[1],enabled:false};return{cwd:root,runtimeIdentity:{sourceId:'verified',version:'0.154.0'}};}});
  await assert.rejects(coordinator.execute(f.runId,signal(),false,true));assert.deepEqual(await f.repo.rehydrate(f.runId),original);assert.equal(f.calls.length,1);
 });
 for(const cancelEarly of [true,false])await t.test('continuation cancel/completion race '+cancelEarly,async()=>{
  const f=await fixture();await f.follow.request(f.runId,signal());let finish;f.behavior(()=>new Promise(resolve=>finish=resolve));const c=new AbortController(),pending=f.tasks.execute(f.runId,c.signal,false,true);await until(()=>finish);if(cancelEarly)c.abort();finish({status:'completed',summary:'Done',evidence:['Tests passed']});await pending;if(!cancelEarly)c.abort();const saved=await f.repo.rehydrate(f.runId);assert.equal(saved.state.tasks[0].status,cancelEarly?'cancelled':'completed');assert.equal(saved.state.tasks[0].attempts.length,2);assert.equal(f.calls.length,2);
 });
 await t.test('continuation gate resumes only, allows preserved dirty files and rejects changed verification',async()=>{
  const f=await fixture(),{TaskContinuationPreflight}=load('main/orchestration/TaskContinuationPreflight');const snapshot=await f.repo.rehydrate(f.runId),task={...snapshot.state.tasks[0],attempts:snapshot.state.tasks[0].attempts.map(a=>({...a,phase:'model_execution'}))};
  const runtime={operationalStatus:'READY',verificationStatus:'passed',installationId:'fixed',cliVersion:'0.154.0',verifiedAt:'2020-01-01T00:00:00.000Z'};const context={run:snapshot.state.run,task,agent:f.agents[1],projectPath:root,branch:'main'};
  for(const mode of ['success','version-race','reverified','session-missing']){
   let reads=0,calls=0;const gate=new TaskContinuationPreflight({...f.workspaces,verifyReady:async()=>({cwd:root,managedRoot:path.dirname(root)})},async()=>({...runtime,...(mode==='version-race'&&reads++>0?{cliVersion:'other'}:{}),...(mode==='reverified'?{verifiedAt:'2099-01-01T00:00:00.000Z'}:{})}),{check:async options=>{calls++;assert.equal(options.threadId,'task-private');assert.equal(options.preserveInstructions,true);assert.equal(options.instructions,'');assert.equal(options.runtimeIdentity.sourceId,'fixed');return{passed:mode!=='session-missing'};}});
   if(mode==='success')assert.equal((await gate.check(context,signal())).cwd,root);else await assert.rejects(gate.check(context,signal()));assert.equal(calls,mode==='reverified'?0:1);
  }
 });

});
