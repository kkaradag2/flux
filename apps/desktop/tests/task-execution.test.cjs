const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs/promises'), path=require('node:path'), ts=require('typescript');
const {randomUUID}=require('node:crypto'), {execFileSync}=require('node:child_process');
test('Single task execution vertical slice', async t=>{
 const root=path.resolve(__dirname,'../../..'), parent=path.join(root,'.cache/execution-tests'); await fs.mkdir(parent,{recursive:true}); const base=await fs.mkdtemp(path.join(parent,'run-'));
 t.after(()=>fs.rm(base,{recursive:true,force:true}));
 async function compile(dir){await fs.mkdir(path.join(base,dir),{recursive:true});for(const entry of await fs.readdir(path.join(root,'apps/desktop/src',dir),{withFileTypes:true})){if(entry.isDirectory()){await compile(path.join(dir,entry.name));continue;}if(!entry.name.endsWith('.ts')||entry.name.endsWith('.d.ts'))continue;await fs.writeFile(path.join(base,dir,entry.name.replace(/\.ts$/,'.js')),ts.transpileModule(await fs.readFile(path.join(root,'apps/desktop/src',dir,entry.name),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText);}}
 for(const dir of ['domain','application','main/orchestration','main/persistence','main/projects','main/chat','main/management','main/app-server','shared'])await compile(dir);
 const load=f=>require(path.join(base,f));
 const {JsonOrchestrationRepository}=load('main/orchestration/JsonOrchestrationRepository'),{createTeamRun,applyOrchestrationCommand}=load('domain/orchestration');
 const {TaskExecutionCoordinator,nextReadyTask}=load('application/orchestration/execution/TaskExecutionCoordinator'),{AgentTaskExecutor,validateTaskExecutionResult}=load('application/orchestration/execution/AgentTaskExecutor'),{AgentRuntimeRouter}=load('application/runtime/AgentRuntimeRouter');
 const {RunWorkspaces,relativeChangedFiles}=load('main/orchestration/RunWorkspaces');
 const delay=()=>new Promise(r=>setImmediate(r));
 async function fixture(t,runtime='codex'){
  const dir=await fs.mkdtemp(path.join(base,'case-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const repo=new JsonOrchestrationRepository({userDataDirectory:path.join(dir,'data'),excludedDirectories:[path.join(dir,'project')]});
  const runId=randomUUID(),decision=()=>({id:randomUUID(),agentId:'lead',occurredAt:new Date().toISOString()});
  await repo.create(createTeamRun({id:runId,conversationId:randomUUID(),projectId:'project',teamId:'team',organizerAgentId:'lead',goal:'Build signup'},decision()));
  await repo.update(runId,state=>applyOrchestrationCommand(state,{type:'plan.initialize',id:'plan',summary:'Build and test',tasks:[{id:'build',title:'Build',description:'Implement',ownerAgentId:'dev',dependsOn:[],acceptanceCriteria:['Works']},{id:'test',title:'Test',description:'Verify',ownerAgentId:'tester',dependsOn:['build'],acceptanceCriteria:['Pass']}]},decision()));
  const agents=['lead','dev','tester'].map(id=>({id,name:id,enabled:true,instructions:id+' PRIVATE instructions',runtime:{type:runtime,model:null,reasoningEffort:'default'}}));const team={agentIds:['lead','dev','tester']};
  const source={getTeam:async()=>team,getAgents:async()=>agents,getConversation:async()=>({projectId:'project',branchName:'main'}),getProject:async()=>({path:path.join(dir,'project')})};
  let behavior=async()=>({status:'completed',summary:'Implemented.',evidence:['Checks passed.']}),calls=[],prepared=0;
  const adapter={type:runtime,getCapabilities:()=>({structuredOutput:true,persistentSessions:true,cancellation:true,workingDirectory:true,sandboxing:true,toolExecution:true}),runTurn:async input=>{
   calls.push(input);const session=input.session??{runtime,externalSessionId:'private-session'};await input.onSession(session);assert.deepEqual((await repo.getTasks(runId)).find(x=>x.status==='working').session,session);
   assert.ok(input.instructions.includes('dev PRIVATE'));assert.ok(!input.instructions.includes('lead PRIVATE'));assert.ok(!input.instructions.includes('tester PRIVATE'));
   if(input.signal.aborted)throw Error('Cancelled'); await input.onExecutionStarted?.(); return {session,value:await behavior(input),durationMs:1};
  }};
  const workspaces={prepare:async()=>{prepared++;return path.join(dir,'isolated')},changedFiles:async()=>['src/signup.tsx']};
  const coordinator=new TaskExecutionCoordinator(repo,source,workspaces,new AgentTaskExecutor(new AgentRuntimeRouter([adapter])),{newId:randomUUID,now:()=>new Date().toISOString()});
  return {dir,repo,runId,agents,team,source,workspaces,coordinator,calls,prepared:()=>prepared,behavior:fn=>behavior=fn,decision};
 }

 async function preparationFailure(t){
  const f=await fixture(t);const command=cmd=>f.repo.update(f.runId,state=>applyOrchestrationCommand(state,cmd,{...f.decision(),agentId:cmd.type==='task.retry'?'lead':'dev'}));
  for(const failure of ['WORKTREE_PREPARATION_FAILED','VALIDATION_FAILED']){
   if(failure==='VALIDATION_FAILED')await command({type:'task.retry',taskId:'build'});
   await command({type:'task.transition',taskId:'build',status:'working'});
   if(failure==='VALIDATION_FAILED')await command({type:'task.execution_phase',taskId:'build',phase:'runtime_preparation'});
   await command({type:'task.finish',taskId:'build',status:'failed',failure,reason:failure,report:{summary:'Safe failure',evidence:[],changedFiles:[],durationMs:1,agentName:'dev'}});
  }return f;
 }
 await t.test('conditional preflight precedes atomic attempt 3, session and model; history and dependencies preserved',async t=>{
  const f=await preparationFailure(t),before=await f.repo.rehydrate(f.runId),order=[];
  const executor={assertSupported(){},async execute(context,signal,onSession,onStarted){
   assert.equal((await f.repo.getTasks(f.runId))[0].attempts.length,3);order.push('attempt');
   await onSession({runtime:'codex',externalSessionId:'test-session'});assert.ok((await f.repo.getTasks(f.runId))[0].session);order.push('session');
   await onStarted();order.push('model');return{status:'completed',summary:'Done',evidence:[]};
  }};
  const gate={async check(){order.push('preflight');assert.deepEqual(await f.repo.rehydrate(f.runId),before);return{cwd:f.dir,runtimeIdentity:{sourceId:'verified',version:'0.154.0'}};}};
  const c=new TaskExecutionCoordinator(f.repo,f.source,f.workspaces,executor,{newId:randomUUID,now:()=>new Date().toISOString()},gate);
  const first=c.execute(f.runId,new AbortController().signal,true);assert.equal(first,c.execute(f.runId,new AbortController().signal,true));await first;
  const after=await f.repo.rehydrate(f.runId);assert.deepEqual(order,['preflight','attempt','session','model']);assert.equal(after.state.tasks[0].attempts.length,3);assert.deepEqual(after.state.tasks[0].attempts.slice(0,2),before.state.tasks[0].attempts);assert.deepEqual(after.events.slice(0,before.events.length),before.events);assert.equal(after.state.tasks[1].status,'ready');assert.equal(f.prepared(),0);
 });
 for(const mode of ['preflight-failed','cancelled','disabled','outside','dependency'])await t.test('conditional retry leaves snapshot intact: '+mode,async t=>{
  const f=await preparationFailure(t),{TaskExecutionError}=load('application/orchestration/execution/AgentTaskExecutor'),controller=new AbortController();let checks=0;
  if(mode==='disabled')f.agents[1].enabled=false;if(mode==='outside')f.team.agentIds=['lead','tester'];
  const original=await f.repo.rehydrate(f.runId);const repo=mode==='dependency'?{...f.repo,rehydrate:async()=>({...original,state:{...original.state,tasks:original.state.tasks.map((task,i)=>i===0?{...task,dependsOn:['test']}:task)}})}:f.repo;
  const c=new TaskExecutionCoordinator(repo,f.source,f.workspaces,{assertSupported(){},execute(){assert.fail('model must not run')}},{newId:randomUUID,now:()=>new Date().toISOString()},{async check(){checks++;if(mode==='cancelled'){controller.abort();return{cwd:f.dir,runtimeIdentity:{sourceId:'fixed',version:'0.154.0'}};}throw new TaskExecutionError('RETRY_PREFLIGHT_FAILED');}});
  await assert.rejects(c.execute(f.runId,controller.signal,true),e=>['RETRY_PREFLIGHT_FAILED','EXECUTION_INTERRUPTED','OWNER_UNAVAILABLE','RETRY_NOT_ALLOWED'].includes(e.code));assert.deepEqual(await f.repo.rehydrate(f.runId),original);assert.equal(checks,['disabled','outside','dependency'].includes(mode)?0:1);
 });
 await t.test('conditional eligibility requires no session and no model start, never generally enables validation failures',async t=>{
  const f=await preparationFailure(t),task=(await f.repo.getTasks(f.runId))[0],{runtimePreparationRetryCandidate,retryableTask}=load('domain/orchestration/taskAttempts');
  assert.equal(runtimePreparationRetryCandidate(task),true);assert.equal(retryableTask(task),false);
  assert.equal(runtimePreparationRetryCandidate({...task,session:{runtime:'codex',externalSessionId:'session'}}),false);
  assert.equal(runtimePreparationRetryCandidate({...task,attempts:task.attempts.map(a=>({...a,phase:'model_execution'}))}),false);
 });
 await t.test('real preflight gate rejects dirty worktrees and changed runtime; balances checking notifications',async t=>{
  const f=await preparationFailure(t),{ConditionalRuntimeRetry}=load('main/orchestration/ConditionalRuntimeRetry'),snapshot=await f.repo.rehydrate(f.runId),task=snapshot.state.tasks[0];
  const state={operationalStatus:'READY',verificationStatus:'passed',cliVersion:'0.154.0',installationId:'selected',verifiedAt:'2020-01-01T00:00:00.000Z'};
  for(const mode of ['dirty','version','installation-race','preflight-failed','passed']){
   let reads=0,checks=0;const notifications=[];
   const gate=new ConditionalRuntimeRetry({verifyReady:async()=>({cwd:f.dir,managedRoot:f.dir}),changedFiles:async()=>mode==='dirty'?['a.txt']:[]},async()=>({...state,...(mode==='version'?{cliVersion:'9.0.0'}:{}),...(mode==='installation-race'&&reads++>0?{installationId:'different'}:{})}),{check:async()=>{checks++;return{passed:mode!=='preflight-failed',stages:[],diagnostic:null}}},async(id,value)=>notifications.push(value));
   const action=gate.check({run:snapshot.state.run,task,agent:f.agents[1],projectPath:f.dir,branch:'main'},new AbortController().signal);
   if(mode==='passed')assert.equal((await action).runtimeIdentity.sourceId,'selected');else await assert.rejects(action,e=>e.code===({dirty:'RETRY_DIRTY_WORKTREE',version:'RETRY_RUNTIME_CHANGED','installation-race':'RETRY_RUNTIME_CHANGED','preflight-failed':'RETRY_PREFLIGHT_FAILED'})[mode]);
   assert.deepEqual(notifications,[true,false]);assert.equal(checks,['dirty','version'].includes(mode)?0:1);assert.deepEqual(await f.repo.rehydrate(f.runId),snapshot);
  }
 });

 for(const runtime of ['codex','claude'])await t.test(`${runtime} routed execution persists session, result and next-ready without scheduler`,async t=>{
  const f=await fixture(t,runtime);await f.coordinator.execute(f.runId,new AbortController().signal);const saved=await f.repo.rehydrate(f.runId);
  assert.equal(saved.state.tasks[0].status,'completed');assert.equal(saved.state.tasks[1].status,'ready');assert.equal(f.calls.length,1);assert.equal(f.calls[0].resultContract,'task-execution');assert.deepEqual(f.calls[0].policy,{readOnly:false,tools:true,network:false});assert.deepEqual(saved.state.tasks[0].execution.changedFiles,['src/signup.tsx']);assert.equal(saved.state.tasks[0].session.runtime,runtime);
 });
 await t.test('selection follows plan order and rejects unfinished dependencies',async t=>{const f=await fixture(t);const {state}=await f.repo.rehydrate(f.runId);const malformed={...state,tasks:state.tasks.map(task=>({...task,status:'ready'})),plans:state.plans.map(plan=>({...plan,taskIds:['test','build']}))};assert.equal(nextReadyTask(malformed).id,'build');assert.equal(nextReadyTask({...state,run:{...state.run,status:'planning'}}),undefined);});
 for(const kind of ['disabled','outside'])await t.test(`${kind} owner cannot start`,async t=>{const f=await fixture(t);if(kind==='disabled')f.agents[1].enabled=false;else f.team.agentIds=['lead','tester'];await assert.rejects(f.coordinator.execute(f.runId,new AbortController().signal),e=>e.code==='OWNER_UNAVAILABLE');assert.equal(f.calls.length,0);assert.equal(f.prepared(),0);});
 await t.test('duplicate start shares one process; cancellation is terminal and no next task starts',async t=>{const f=await fixture(t),controller=new AbortController();f.behavior(input=>new Promise((resolve,reject)=>input.signal.addEventListener('abort',()=>reject(Error('PRIVATE provider')), {once:true})));const first=f.coordinator.execute(f.runId,controller.signal),second=f.coordinator.execute(f.runId,controller.signal);assert.equal(first,second);while(!f.calls.length)await delay();controller.abort();await first;const state=(await f.repo.rehydrate(f.runId)).state;assert.equal(state.tasks[0].status,'cancelled');assert.equal(state.tasks[1].status,'planned');assert.equal(f.calls.length,1);assert.ok(!JSON.stringify(state.tasks[0].execution).includes('PRIVATE'));});
 for(const status of ['blocked','failed'])await t.test(`${status} is persisted safely`,async t=>{const f=await fixture(t);f.behavior(async()=>{if(status==='failed')throw Error('SECRET stderr');return {status:'blocked',summary:'Needs input',evidence:[]}});await f.coordinator.execute(f.runId,new AbortController().signal);const state=(await f.repo.rehydrate(f.runId)).state;assert.equal(state.tasks[0].status,status);assert.equal(state.tasks[1].status,'planned');assert.ok(!JSON.stringify(state.tasks[0].execution).includes('SECRET'));});
 await t.test('completed result wins a later cancel and completion has no role-specific guard',async t=>{const f=await fixture(t),c=new AbortController();await f.coordinator.execute(f.runId,c.signal);c.abort();assert.equal((await f.repo.getTasks(f.runId))[0].status,'completed');const another=await fixture(t);const state=(await another.repo.rehydrate(another.runId)).state;const working=applyOrchestrationCommand({...state,tasks:state.tasks.map(task=>({...task}))},{type:'task.transition',taskId:'build',status:'working'},{...another.decision(),agentId:'dev'});const finished=applyOrchestrationCommand(working.state,{type:'task.finish',taskId:'build',status:'completed',report:{summary:'Done',evidence:[],changedFiles:[],durationMs:1,agentName:'Dev'}},{...another.decision(),agentId:'dev'});assert.equal(finished.state.tasks[0].status,'completed');assert.equal(finished.state.tasks[1].status,'ready');});
 await t.test('recovery is idempotent, retains session, never retries',async t=>{const f=await fixture(t);await f.repo.update(f.runId,state=>applyOrchestrationCommand(state,{type:'task.transition',taskId:'build',status:'working'},{...f.decision(),agentId:'dev'}));await f.repo.update(f.runId,state=>applyOrchestrationCommand(state,{type:'task.set_session',taskId:'build',session:{runtime:'codex',externalSessionId:'retained'}},{...f.decision(),agentId:'dev'}));await f.coordinator.recover();const first=await f.repo.rehydrate(f.runId);await f.coordinator.recover();assert.deepEqual(await f.repo.rehydrate(f.runId),first);assert.equal(first.state.tasks[0].status,'failed');assert.equal(first.state.tasks[0].session.externalSessionId,'retained');assert.equal(f.calls.length,0);});
 await t.test('semantic results reject extras and bound content; redact paths and credentials',()=>{assert.throws(()=>validateTaskExecutionResult({status:'completed',summary:'ok',evidence:[],raw:'SECRET'}));assert.throws(()=>validateTaskExecutionResult({status:'completed',summary:'x'.repeat(4001),evidence:[]}));const value=validateTaskExecutionResult({status:'completed',summary:'C:\\private\\file token=secret sk-abcdef',evidence:[]});assert.ok(!JSON.stringify(value).includes('secret'));assert.ok(!value.summary.includes('C:'));});
 await t.test('execution chat persists the owner and deduplicates repeated publication; explicit continuation reuses session',async t=>{
  const f=await fixture(t),{ConversationRepository}=load('main/chat/ConversationRepository'),{TeamConversationJournal}=load('main/orchestration/TeamConversationJournal');
  const run=await f.repo.getRun(f.runId),store=new ConversationRepository(path.join(f.dir,'conversations')),now=new Date().toISOString();
  const agent={id:'lead',name:'Lead',description:'Plans',instructionsMarkdown:'PRIVATE',enabled:true,avatar:{type:'builtin',value:'robot'},runtime:{type:'codex',model:null,reasoningEffort:'default'},createdAt:now,updatedAt:now};
  await store.save({id:run.conversationId,projectId:'project',teamId:'team',branchName:'main',leadAgentId:'lead',mode:'team',codexThreadId:null,title:'Task',status:'completed',interrupted:false,createdAt:now,updatedAt:now,agentDefinition:agent,agentSnapshot:{id:'lead',name:'Lead',avatar:agent.avatar},messages:[]});
  const journal=new TeamConversationJournal(store,f.source,{getAgents:async()=>[agent,{...agent,id:'dev',name:'dev'}]});
  f.behavior(async()=>({status:'blocked',summary:'Need input',evidence:[]}));await f.coordinator.execute(f.runId,new AbortController().signal);await journal.sync(await f.repo.rehydrate(f.runId));await journal.sync(await f.repo.rehydrate(f.runId));
  await f.repo.update(f.runId,state=>applyOrchestrationCommand(state,{type:'task.transition',taskId:'build',status:'ready',reason:'Explicit follow-up'},f.decision()));await journal.sync(await f.repo.rehydrate(f.runId));assert.equal((await store.get(run.conversationId)).messages.length,1);
  f.behavior(async()=>({status:'completed',summary:'Implemented',evidence:[]}));await f.coordinator.execute(f.runId,new AbortController().signal);await journal.sync(await f.repo.rehydrate(f.runId));
  const saved=await new ConversationRepository(path.join(f.dir,'conversations')).get(run.conversationId);assert.equal(saved.messages.length,2);assert.equal(saved.messages[0].superseded,true);assert.equal(saved.messages.filter(message=>!message.superseded).length,1);assert.equal(saved.messages[1].agentSnapshot.id,'dev');assert.equal(saved.messages[1].agentSnapshot.name,'dev');assert.equal(f.calls[1].session.externalSessionId,'private-session');assert.ok(!JSON.stringify(saved.messages).includes('PRIVATE'));
 });
 await t.test('real isolated worktree reuses identity; Git determines files and preserves main HEAD/content',async t=>{
  const f=await fixture(t),repo=path.join(f.dir,'project');await fs.mkdir(repo);const git=(cwd,...args)=>execFileSync('git',['-C',cwd,...args],{encoding:'utf8',windowsHide:true}).trim();git(repo,'init','-b','main');await fs.writeFile(path.join(repo,'readme.txt'),'baseline');git(repo,'add','.');git(repo,'-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','fixture');const head=git(repo,'rev-parse','HEAD'),before=await fs.readFile(path.join(repo,'readme.txt'),'utf8');const workspaces=new RunWorkspaces(path.join(f.dir,'runtime-data')),run=await f.repo.getRun(f.runId);const cwd=await workspaces.prepare(run,'main',repo);assert.ok(!cwd.startsWith(repo+path.sep));assert.equal(await workspaces.prepare(run,'main',repo),cwd);await fs.writeFile(path.join(cwd,'readme.txt'),'changed');await fs.writeFile(path.join(cwd,'new file.txt'),'new');assert.deepEqual(await workspaces.changedFiles(cwd),['new file.txt','readme.txt']);assert.equal(git(repo,'rev-parse','HEAD'),head);assert.equal(git(repo,'status','--porcelain'),'');assert.equal(await fs.readFile(path.join(repo,'readme.txt'),'utf8'),before);
 });
 await t.test('Git status parser handles rename and rejects non-relative or control paths',()=>{assert.deepEqual(relativeChangedFiles(' M src/a.ts\0R  new.ts\0old.ts\0?? spaced name.ts\0'),['new.ts','old.ts','spaced name.ts','src/a.ts']);for(const file of ['/outside','../outside','C:/outside','a\nsecret','.git/config'])assert.throws(()=>relativeChangedFiles('?? '+file+'\0'));});
 await t.test('managed Windows-length checkout uses invocation-scoped longpaths without changing Git config',async t=>{
  const f=await fixture(t),repo=path.join(f.dir,'project');await fs.mkdir(repo);const git=(...args)=>execFileSync('git',['-C',repo,'-c','core.longpaths=true',...args],{encoding:'utf8',windowsHide:true}).trim();git('init','-b','main');
  const relative=path.join('a'.repeat(70),'b'.repeat(70),'file.ts');await fs.mkdir(path.dirname(path.join(repo,relative)),{recursive:true});await fs.writeFile(path.join(repo,relative),'export {};');git('add','.');git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','long-path fixture');
  const before=await fs.readFile(path.join(repo,'.git/config'),'utf8'),workspaces=new RunWorkspaces(path.join(f.dir,'runtime-data'));const cwd=await workspaces.prepare(await f.repo.getRun(f.runId),'main',repo);
  assert.ok(path.join(cwd,relative).length>260);assert.equal(await fs.readFile(path.join(cwd,relative),'utf8'),'export {};');assert.equal(await fs.readFile(path.join(repo,'.git/config'),'utf8'),before);
 });
 await t.test('main start/cancel is narrow, idempotent and waits for owner/shutdown cleanup',async t=>{
  const f=await fixture(t),{OrchestrationService}=load('main/orchestration/OrchestrationService');let calls=0,ended=0;
  const tasks={execute:async(_id,signal)=>{calls++;await new Promise(resolve=>{if(signal.aborted)resolve();else signal.addEventListener('abort',resolve,{once:true})});ended++;}};
  const service=new OrchestrationService({...f.source,validate:async()=>{}},f.repo,{}, {project:async()=>({tasks:[]}),subscribe:()=>()=>{}},()=>true,()=>true,undefined,tasks);
  assert.throws(()=>service.execute(1,{runId:f.runId,path:'UNSAFE'}));
  const first=service.execute(1,{runId:f.runId});assert.equal(service.execute(1,{runId:f.runId}),first);
  while(!calls)await delay();await Promise.all([service.cancelExecution(1,{runId:f.runId}),service.cancelExecution(1,{runId:f.runId})]);await first;assert.equal(calls,1);assert.equal(ended,1);
  const second=service.execute(1,{runId:f.runId});while(calls!==2)await delay();service.closeOwner(1);await second;assert.equal(ended,2);
  const third=service.execute(2,{runId:f.runId});await service.shutdown();await third;assert.equal(ended,3);assert.throws(()=>service.execute(1,{runId:f.runId}));
 });
 await t.test('Codex workspace-write contract is constrained, rejects approval and never streams tools',async()=>{
  const {CodexChatSession}=load('main/app-server/CodexChatSession');
  for(const mode of ['success','approval','unsafe-root']){
   const calls=[],listeners=new Set();let notify,request,closed=0,reply;
   const policy={type:'workspaceWrite',writableRoots:[mode==='unsafe-root'?'other':root],networkAccess:false,excludeTmpdirEnvVar:true,excludeSlashTmp:true};
   const wire={close:async()=>{closed++},onNotification:fn=>{notify=fn;listeners.add(fn);return()=>listeners.delete(fn)},onRequest:fn=>{request=fn;listeners.add(fn);return()=>listeners.delete(fn)},onFailure:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},notify:async(method)=>calls.push({method}),reply:async(id,result)=>{reply={id,result}},request:async(method,params)=>{
    calls.push({method,params});if(method==='initialize')return{userAgent:'fixture'};if(method==='mcpServerStatus/list')return{data:[],nextCursor:null};if(method==='thread/start')return{thread:{id:'session'},cwd:root,approvalPolicy:'never',sandbox:policy};if(method==='turn/start'){
     setImmediate(()=>{if(mode==='approval'){request({id:9,method:'item/fileChange/requestApproval',params:{}});return;}notify({method:'item/completed',params:{threadId:'session',turnId:'turn',item:{type:'fileChange'}}});notify({method:'turn/completed',params:{threadId:'session',turn:{id:'turn',status:'completed',items:[{type:'commandExecution'},{id:'answer',type:'agentMessage',phase:'final_answer',text:'{"status":"completed","summary":"Done","evidence":[]}'}]}}});});return{turn:{id:'turn'}};}
   }};
   let saved=false;const session=new CodexChatSession(async()=>wire,{outputSchema:{type:'object'},taskExecution:true});const action=session.turn({cwd:root,instructions:'owner only',runtime:{type:'codex',model:null,reasoningEffort:'default'},onThread:async()=>{saved=true}},'task',new AbortController().signal,()=>{});
   if(mode==='success'){assert.ok((await action).includes('Done'));assert.ok(saved);const turn=calls.find(c=>c.method==='turn/start').params;assert.deepEqual(turn.sandboxPolicy,policy);assert.equal(turn.approvalPolicy,'never');assert.ok(!('effort' in turn));}else{await assert.rejects(action);if(mode==='approval')assert.deepEqual(reply,{id:9,result:{decision:'decline'}});else assert.ok(!calls.some(c=>c.method==='turn/start'));}
   await session.close();assert.equal(listeners.size,0);assert.ok(closed>0);
  }
 });
 await t.test('retry preserves failed attempt and events, repeats ownership/dependencies, double call shares one attempt',async t=>{
  const f=await fixture(t),{TaskExecutionError}=load('application/orchestration/execution/AgentTaskExecutor');const prepare=f.workspaces.prepare;
  f.workspaces.prepare=async()=>{throw new TaskExecutionError('WORKTREE_PREPARATION_FAILED')};await f.coordinator.execute(f.runId,new AbortController().signal);
  const prior=await f.repo.rehydrate(f.runId);assert.equal(prior.state.tasks[0].attempts[0].failure,'WORKTREE_PREPARATION_FAILED');assert.equal(f.calls.length,0);assert.ok(await f.coordinator.retryCandidate(f.runId));
  f.workspaces.prepare=prepare;f.agents[1].enabled=false;await assert.rejects(f.coordinator.execute(f.runId,new AbortController().signal,true),e=>e.code==='OWNER_UNAVAILABLE');f.agents[1].enabled=true;
  const first=f.coordinator.execute(f.runId,new AbortController().signal,true),second=f.coordinator.execute(f.runId,new AbortController().signal,true);assert.equal(first,second);await first;
  const saved=await f.repo.rehydrate(f.runId),task=saved.state.tasks[0];assert.deepEqual(task.attempts.map(a=>a.number),[1,2]);assert.equal(task.attempts[0].status,'failed');assert.equal(task.attempts[1].status,'completed');assert.equal(task.attempts[1].phase,'model_execution');assert.equal(f.calls.length,1);assert.ok(prior.events.every(event=>saved.events.some(saved=>saved.id===event.id)));
  await assert.rejects(f.coordinator.execute(f.runId,new AbortController().signal,true),e=>e.code==='RETRY_NOT_ALLOWED');
 });
 await t.test('retry classification excludes security, semantic failures, working/review/blocked/completed',()=>{
  const {executionFailure}=load('application/orchestration/execution/TaskExecutionCoordinator'),{TaskExecutionError}=load('application/orchestration/execution/AgentTaskExecutor'),{AgentRuntimeError}=load('application/runtime/AgentRuntimeError'),{retryableTask}=load('domain/orchestration/taskAttempts');
  assert.equal(executionFailure(new TaskExecutionError('UNSAFE_WORKTREE'),'worktree_preparation',false),'SECURITY_VIOLATION');assert.equal(executionFailure(new AgentRuntimeError('RUNTIME_PROTOCOL_ERROR'),'runtime_preparation',false),'VALIDATION_FAILED');assert.equal(executionFailure(new AgentRuntimeError('RUNTIME_TIMEOUT'),'runtime_preparation',false),'RUNTIME_PREPARATION_FAILED');assert.equal(executionFailure(new AgentRuntimeError('RUNTIME_TIMEOUT'),'model_execution',false),'RUNTIME_FAILED');
  const task={status:'failed',attempts:[{number:1,phase:'runtime_preparation',failure:'RUNTIME_PREPARATION_FAILED'}]};assert.equal(retryableTask(task),true);for(const status of ['blocked','needs_attention','completed','working','cancelled'])assert.equal(retryableTask({...task,status}),false);
  for(const failure of ['SECURITY_VIOLATION','VALIDATION_FAILED','UNKNOWN_FAILURE'])assert.equal(retryableTask({...task,attempts:[{...task.attempts[0],failure}]}),false);
 });
 await t.test('retry cancellation preserves first failure and recovery ends the current attempt only once',async t=>{
  const f=await fixture(t),{TaskExecutionError}=load('application/orchestration/execution/AgentTaskExecutor'),prepare=f.workspaces.prepare;
  f.workspaces.prepare=async()=>{throw new TaskExecutionError('WORKTREE_PREPARATION_FAILED')};await f.coordinator.execute(f.runId,new AbortController().signal);f.workspaces.prepare=prepare;
  const controller=new AbortController();f.behavior(input=>new Promise((resolve,reject)=>{if(input.signal.aborted)reject(Error('cancel'));else input.signal.addEventListener('abort',()=>reject(Error('cancel')),{once:true})}));const promise=f.coordinator.execute(f.runId,controller.signal,true);while(!f.calls.length)await delay();controller.abort();await promise;
  const task=(await f.repo.getTasks(f.runId))[0];assert.equal(task.attempts.length,2);assert.equal(task.attempts[0].status,'failed');assert.equal(task.attempts[1].status,'cancelled');await assert.rejects(f.coordinator.execute(f.runId,new AbortController().signal,true));
 });
 await t.test('restart during retry records one interrupted second attempt and preserves the first result/session',async t=>{
  const f=await fixture(t),{TaskExecutionError}=load('application/orchestration/execution/AgentTaskExecutor');f.workspaces.prepare=async()=>{throw new TaskExecutionError('WORKTREE_PREPARATION_FAILED')};await f.coordinator.execute(f.runId,new AbortController().signal);const first=(await f.repo.getTasks(f.runId))[0].attempts[0];
  await f.repo.update(f.runId,state=>applyOrchestrationCommand(state,{type:'task.retry',taskId:'build'},f.decision()));await f.repo.update(f.runId,state=>applyOrchestrationCommand(state,{type:'task.transition',taskId:'build',status:'working'},{...f.decision(),agentId:'dev'}));await f.repo.update(f.runId,state=>applyOrchestrationCommand(state,{type:'task.set_session',taskId:'build',session:{runtime:'codex',externalSessionId:'preserved-retry-session'}},{...f.decision(),agentId:'dev'}));
  await f.coordinator.recover();const saved=await f.repo.rehydrate(f.runId);await f.coordinator.recover();assert.deepEqual(await f.repo.rehydrate(f.runId),saved);assert.deepEqual(saved.state.tasks[0].attempts[0],first);assert.equal(saved.state.tasks[0].attempts[1].failure,'EXECUTION_INTERRUPTED');assert.equal(saved.state.tasks[0].session.externalSessionId,'preserved-retry-session');assert.equal(f.calls.length,0);
 });
 await t.test('worktree reconciliation attaches only a proven owned branch, reuses valid tree and leaves unknown paths untouched',async t=>{
  const f=await fixture(t),repo=path.join(f.dir,'project');await fs.mkdir(repo);const git=(...args)=>execFileSync('git',['-C',repo,...args],{encoding:'utf8',windowsHide:true}).trim();git('init','-b','main');await fs.writeFile(path.join(repo,'file'),'base');git('add','.');git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','fixture');
  const {ConversationWorktreeService}=load('main/chat/ConversationWorktreeService'),{GitCommandRunner}=load('main/projects/GitCommandRunner'),{GitRepositoryService}=load('main/projects/GitRepositoryService');
  const runner=new GitCommandRunner(),service=new ConversationWorktreeService(path.join(f.dir,'w'),runner,new GitRepositoryService(runner),true,true),record={id:randomUUID(),projectId:'project',branchName:'main'},save=async()=>{};
  const cwd=await service.ensure(record,repo,save);assert.equal(await service.reconciliation(record,repo),'reuse');assert.equal(await service.ensure(record,repo,save,true),cwd);
  git('worktree','remove',cwd);record.worktreeStatus='failed';assert.equal(await service.reconciliation(record,repo),'attach');const config=await fs.readFile(path.join(repo,'.git/config'),'utf8');assert.equal(await service.ensure(record,repo,save,true),cwd);assert.equal(await fs.readFile(path.join(repo,'.git/config'),'utf8'),config);
  const unknown={id:randomUUID(),projectId:'project',branchName:'main'},foreign=path.join(f.dir,'w',unknown.id);await fs.mkdir(foreign);await fs.writeFile(path.join(foreign,'user.txt'),'keep');await assert.rejects(service.ensure(unknown,repo,save,true),e=>e.code==='WORKTREE_CONFLICT');assert.equal(await fs.readFile(path.join(foreign,'user.txt'),'utf8'),'keep');
  const ambiguous={id:randomUUID(),projectId:'project',branchName:'main'};git('branch','flux/'+ambiguous.id.replaceAll('-','').slice(0,16));await assert.rejects(service.ensure(ambiguous,repo,save,true),e=>e.code==='WORKTREE_CONFLICT');
 });
 await t.test('empty legacy profile location can be re-prepared in compact managed root, existing foreign path is untouched',async t=>{
  const f=await fixture(t),repo=path.join(f.dir,'project');await fs.mkdir(repo);const git=(...args)=>execFileSync('git',['-C',repo,...args],{encoding:'utf8',windowsHide:true}).trim();git('init','-b','main');await fs.writeFile(path.join(repo,'file'),'base');git('add','.');git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','fixture');
  const userData=path.join(f.dir,'profile'),run=await f.repo.getRun(f.runId),oldPath=path.join(f.dir,'old-profile','worktrees',run.projectId,run.id);await fs.mkdir(path.join(userData,'task-workspaces'),{recursive:true});const record={id:run.id,projectId:run.projectId,branchName:'main',baseBranch:'main',workBranch:'flux/'+run.id.replaceAll('-','').slice(0,16),worktreePath:oldPath,worktreeStatus:'failed',worktreeCreatedAt:null};await fs.writeFile(path.join(userData,'task-workspaces',run.id+'.json'),JSON.stringify({schemaVersion:1,record}));
  const workspace=new RunWorkspaces(userData);assert.equal(await workspace.retryablePreparation(run,repo),true);
  await fs.mkdir(oldPath,{recursive:true});await fs.writeFile(path.join(oldPath,'user.txt'),'keep');assert.equal(await workspace.retryablePreparation(run,repo),false);await assert.rejects(workspace.prepare(run,'main',repo,true));assert.equal(await fs.readFile(path.join(oldPath,'user.txt'),'utf8'),'keep');
  // Remove only the isolated fixture files we just created, never runtime/user data.
  await fs.unlink(path.join(oldPath,'user.txt'));await fs.rmdir(oldPath);const cwd=await workspace.prepare(run,'main',repo,true);assert.equal(cwd,path.join(userData,'w',run.id));assert.equal(await fs.readFile(path.join(cwd,'file'),'utf8'),'base');const saved=JSON.parse(await fs.readFile(path.join(userData,'task-workspaces',run.id+'.json'),'utf8'));assert.equal(saved.record.previousWorktreePath,oldPath);assert.equal(saved.record.worktreeStatus,'ready');
 });
 for(const runtime of ['codex','claude'])for(const status of ['completed','needs_attention','blocked'])await t.test(runtime+' generic result '+status+' controls dependencies',async t=>{const f=await fixture(t,runtime);f.behavior(async()=>({status,summary:'Outcome',evidence:[]}));await f.coordinator.execute(f.runId,new AbortController().signal);const tasks=await f.repo.getTasks(f.runId);assert.equal(tasks[0].status,status);assert.equal(tasks[1].status,status==='completed'?'ready':'planned');assert.equal(tasks[0].attempts.at(-1).failure,null);assert.equal('requiresReview' in tasks[0],false);assert.equal('reviewerAgentId' in tasks[0],false);});
 await t.test('wire and internal result schemas distinguish agent outcomes from infrastructure failure',()=>{const {codexTaskSchema,decodeCodexTask}=load('main/app-server/CodexTaskSchema');assert.deepEqual(codexTaskSchema.properties.status.enum,['completed','needs_attention','blocked']);assert.equal(codexTaskSchema.additionalProperties,false);assert.deepEqual(codexTaskSchema.required,Object.keys(codexTaskSchema.properties));assert.throws(()=>validateTaskExecutionResult(decodeCodexTask(JSON.stringify({status:'failed',summary:'Technical error',evidence:[]}))));});

});
