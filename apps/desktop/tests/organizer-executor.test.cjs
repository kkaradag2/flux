const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),ts=require('typescript');
const {EventEmitter}=require('node:events'),{PassThrough,Writable}=require('node:stream');
test('Organizer executor with real JSONL transport and mock App Server',async t=>{
 const root=path.resolve(__dirname,'../../..'),parent=path.join(root,'.cache/organizer-executor-tests');await fs.mkdir(parent,{recursive:true});const base=await fs.mkdtemp(path.join(parent,'run-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 for(const folder of ['main/app-server','application/orchestration/organizer','application/runtime','domain/orchestration','shared']){await fs.mkdir(path.join(base,folder),{recursive:true});for(const file of await fs.readdir(path.join(root,'apps/desktop/src',folder))){if(!file.endsWith('.ts'))continue;await fs.writeFile(path.join(base,folder,file.replace(/\.ts$/,'.js')),ts.transpileModule(await fs.readFile(path.join(root,'apps/desktop/src',folder,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)}}
 const load=name=>require(path.join(base,'main/app-server',name));
 const {CodexAppServerTransport}=load('CodexAppServerTransport'),{CodexAppServerClient}=load('CodexAppServerClient'),{CodexAgentRuntimeAdapter}=load('CodexAgentRuntimeAdapter');
 const {codexOrganizerWireSchema:schema}=load('CodexOrganizerSchema');
 const {OrganizerDecisionExecutor}=require(path.join(base,'application/orchestration/organizer/OrganizerDecisionExecutor'));
 const {AgentRuntimeRouter}=require(path.join(base,'application/runtime/AgentRuntimeRouter'));
 class Executor extends OrganizerDecisionExecutor { constructor(source,timeout) { super(new AgentRuntimeRouter([new CodexAgentRuntimeAdapter(source,timeout)])); } }
 const context={teamId:'team',teamName:'Core',organizerAgentId:'lead',organizerAgentName:'Lead',conversationId:'c',projectId:'p',projectName:'Flux',branch:'main',userRequest:'Add signup',members:[{id:'lead',name:'Lead',description:'Coordinates',runtime:'codex',enabled:true},{id:'dev',name:'Developer',description:'Builds',runtime:'codex',enabled:true},{id:'off',name:'Disabled',description:'Tests',runtime:'codex',enabled:false}]};
 const input={context,instruction:'Saved instruction',runtime:'codex',settings:{model:null,reasoningEffort:'default'},cwd:root,signal:new AbortController().signal};
 const task={key:'build',title:'Build',description:'Implement signup',assigneeAgentId:'dev',dependsOn:[],acceptanceCriteria:['Email is validated'],requiresReview:true};
 const decisions=[{type:'respond',message:'Answer'},{type:'ask_user',message:'Clarify',questions:['Which framework?']},{type:'create_plan',message:'Plan',planSummary:'Build signup',tasks:[task]}];
 const tick=()=>new Promise(r=>setImmediate(r));
 async function until(check){for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,5))}assert.fail('mock did not reach expected state')}
 function fixture(output=JSON.stringify(decisions[0]),mode='success',thread='thread-a'){
  try { const parsed=JSON.parse(output); if(parsed&&typeof parsed==='object') output=JSON.stringify({questions:[],planSummary:'',tasks:[],...parsed}); } catch {}
  const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();let killed=0;const sent=[];
  const send=value=>{if(!child.stdout.destroyed)child.stdout.write(JSON.stringify(value)+'\n')};
  const complete=status=>send({method:'turn/completed',params:{threadId:thread,turn:{id:'turn',status,items:[]}}});
  child.stdin=new Writable({write(chunk,encoding,cb){const msg=JSON.parse(chunk.toString());sent.push(msg);cb();queueMicrotask(()=>{
   if(msg.method==='initialize'){if(mode==='exit'){child.emit('close',1);return;}if(mode==='malformed'){child.stdout.write('SECRET_RAW broken\n');return;}if(mode==='startup-hold')return;send({id:msg.id,result:{userAgent:'codex-cli 0.154.0'}})}
   if(msg.method==='mcpServerStatus/list')send({id:msg.id,result:{data:[],nextCursor:null}});
   if(['thread/start','thread/resume'].includes(msg.method))send({id:msg.id,result:{thread:{id:thread},approvalPolicy:'never',sandbox:{type:'readOnly',networkAccess:false}}});
   if(msg.method==='turn/start'){
    send({id:msg.id,result:{turn:{id:'turn'}}});child.stderr.write('SECRET_STDERR');
    if(mode==='hold')return;
    if(mode==='approval'){send({id:999,method:'item/commandExecution/requestApproval',params:{}});return;}
    if(mode==='tool'){send({method:'item/started',params:{threadId:thread,turnId:'turn',item:{type:'commandExecution',id:'tool'}}});return;}
    if(mode==='failed'){complete('failed');return;}
    send({method:'item/completed',params:{threadId:thread,turnId:'turn',item:{type:'agentMessage',id:'answer',phase:'final_answer',text:output}}});complete('completed');
   }
   if(msg.method==='turn/interrupt'){send({id:msg.id,result:{}});complete('interrupted')}
  })}});
  const wire=new CodexAppServerTransport(child,async()=>{killed++;child.emit('close',0)});
  const client=new CodexAppServerClient(async()=>wire);
  const source={resolve:async()=>({client,structuredOutput:true})};
  const clean=()=>{assert.equal(killed,1);assert.equal(wire.pending.size,0);assert.equal(wire.notifications.size,0);assert.equal(wire.requests.size,0);assert.equal(child.stdout.listenerCount('data'),0);assert.equal(child.stderr.listenerCount('data'),0)};
  return{client,source,wire,sent,clean};
 }
 await t.test('session persistence callback is awaited before starting a turn',async()=>{
  const f=fixture();let release,entered;const started=new Promise(resolve=>entered=resolve);
  const pending=new Executor(f.source).execute({...input,onSession:async session=>{
   assert.deepEqual(session,{runtime:'codex',externalSessionId:'thread-a'});entered();await new Promise(resolve=>release=resolve);
  }});
  await started;assert.ok(!f.sent.some(x=>x.method==='turn/start'));release();await pending;
  assert.equal(f.sent.filter(x=>x.method==='turn/start').length,1);f.clean();
 });
 await t.test('failed session persistence prevents a model turn and cleans transport',async()=>{
  const f=fixture();await assert.rejects(new Executor(f.source).execute({...input,onSession:async()=>{throw new Error('SECRET persistence failure')}}),e=>e.code==='RUNTIME_PROTOCOL_ERROR'&&!e.message.includes('SECRET'));
  assert.ok(!f.sent.some(x=>x.method==='turn/start'));f.clean();
 });
 for(const decision of decisions)await t.test('valid '+decision.type+' with strict schema, instructions and safe defaults',async()=>{
  const f=fixture(JSON.stringify(decision));const result=await new Executor(f.source).execute(input);
  assert.deepEqual(result.decision,decision);assert.equal(result.session.externalSessionId,'thread-a');assert.ok(result.durationMs>=0);
  const start=f.sent.find(x=>x.method==='thread/start').params,turn=f.sent.find(x=>x.method==='turn/start').params;
  assert.equal(start.ephemeral,false);assert.match(start.developerInstructions,/Saved instruction/);assert.match(start.developerInstructions,/Flux Organizer runtime contract/);
  assert.deepEqual(turn.outputSchema,schema);assert.equal(turn.approvalPolicy,'never');assert.deepEqual(turn.sandboxPolicy,{type:'readOnly',networkAccess:false});assert.ok(!('model'in start));assert.ok(!('effort'in turn));f.clean();
 });
 await t.test('resume exact thread with explicit model and effort',async()=>{const f=fixture();await new Executor(f.source).execute({...input,session:{runtime:'codex',externalSessionId:'thread-a'},settings:{model:'configured-model',reasoningEffort:'high'}});assert.ok(!f.sent.some(x=>x.method==='thread/start'));assert.equal(f.sent.find(x=>x.method==='thread/resume').params.threadId,'thread-a');assert.equal(f.sent.find(x=>x.method==='thread/resume').params.model,'configured-model');assert.equal(f.sent.find(x=>x.method==='turn/start').params.effort,'high');f.clean()});
 for(const output of ['SECRET_RAW markdown','```json\n'+JSON.stringify(decisions[0])+'\n```',JSON.stringify({...decisions[2],tasks:[{...task,assigneeAgentId:'unknown'}]}),JSON.stringify({...decisions[2],tasks:[{...task,assigneeAgentId:'off'}]}),JSON.stringify({...decisions[2],tasks:[{...task,dependsOn:['missing']}]} )])await t.test('invalid structured decision rejected without leaking model output',async()=>{const f=fixture(output);await assert.rejects(new Executor(f.source).execute(input),e=>e.code==='INVALID_STRUCTURED_RESULT'&&!e.message.includes('SECRET_RAW')&&!JSON.stringify(e).includes('SECRET_STDERR'));f.clean()});
 for(const [mode,code]of[['exit','RUNTIME_PROCESS_EXITED'],['malformed','RUNTIME_PROTOCOL_ERROR'],['failed','RUNTIME_PROTOCOL_ERROR'],['approval','UNEXPECTED_TOOL_REQUEST'],['tool','UNEXPECTED_TOOL_REQUEST']])await t.test(mode+' maps safely and cleans transport',async()=>{const f=fixture('',mode);await assert.rejects(new Executor(f.source).execute(input),e=>e.code===code&&!e.message.includes('SECRET'));if(mode==='approval')assert.deepEqual(f.sent.find(x=>x.id===999).result,{decision:'decline'});f.clean()});
 await t.test('timeout interrupts active turn and cleans pending requests',async()=>{const f=fixture('','hold');await assert.rejects(new Executor(f.source,25).execute(input),e=>e.code==='RUNTIME_TIMEOUT');assert.ok(f.sent.some(x=>x.method==='turn/interrupt'));f.clean()});
 await t.test('cancellation during startup terminates process and pending initialize',async()=>{const f=fixture('','startup-hold'),controller=new AbortController();const pending=new Executor(f.source).execute({...input,signal:controller.signal});await until(()=>f.sent.length>0);controller.abort();await assert.rejects(pending,e=>e.code==='RUNTIME_CANCELLED');f.clean()});
 await t.test('same thread excluded across instances; different threads run independently',async()=>{const a=fixture('','hold','thread-a'),b=fixture(JSON.stringify(decisions[0]),'success','thread-b'),controller=new AbortController();const pending=new Executor(a.source).execute({...input,session:{runtime:'codex',externalSessionId:'thread-a'},signal:controller.signal});await until(()=>a.sent.some(x=>x.method==='turn/start'));await assert.rejects(new Executor(b.source).execute({...input,session:{runtime:'codex',externalSessionId:'thread-a'}}),e=>e.code==='RUNTIME_SESSION_BUSY');assert.equal((await new Executor(b.source).execute({...input,session:{runtime:'codex',externalSessionId:'thread-b'}})).session.externalSessionId,'thread-b');controller.abort();await assert.rejects(pending,e=>e.code==='RUNTIME_CANCELLED');a.clean();b.clean();await tick()});
 await t.test('unready/unsupported runtime fails before opening a session',async()=>{await assert.rejects(new Executor({resolve:async()=>null}).execute(input),e=>e.code==='RUNTIME_NOT_READY');await assert.rejects(new Executor({resolve:async()=>({structuredOutput:false})}).execute(input),e=>e.code==='RUNTIME_CAPABILITY_MISSING')});
 await t.test('adapter cancel uses generic session reference and completes cleanup',async()=>{const f=fixture('','hold');const adapter=new CodexAgentRuntimeAdapter(f.source);const app=new OrganizerDecisionExecutor(new AgentRuntimeRouter([adapter]));const pending=app.execute({...input,session:{runtime:'codex',externalSessionId:'thread-a'}});await until(()=>f.sent.some(x=>x.method==='turn/start'));await adapter.cancel({runtime:'codex',externalSessionId:'thread-a'});await assert.rejects(pending,e=>e.code==='RUNTIME_CANCELLED');f.clean()});
});
