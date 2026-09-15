const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),ts=require('typescript');
test('Runtime abstraction and adapter-specific schema',async t=>{
 const root=path.resolve(__dirname,'../../..'),source=path.join(root,'apps/desktop/src'),parent=path.join(root,'.cache/runtime-router-tests');await fs.mkdir(parent,{recursive:true});const out=await fs.mkdtemp(path.join(parent,'run-'));t.after(()=>fs.rm(out,{recursive:true,force:true}));
 for(const folder of ['application/runtime','application/orchestration/organizer','domain/orchestration','shared','main/app-server']){await fs.mkdir(path.join(out,folder),{recursive:true});for(const file of await fs.readdir(path.join(source,folder))){if(file.endsWith('.ts'))await fs.writeFile(path.join(out,folder,file.replace(/\.ts$/,'.js')),ts.transpileModule(await fs.readFile(path.join(source,folder,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)}}
 const {AgentRuntimeRouter}=require(path.join(out,'application/runtime/AgentRuntimeRouter'));
 const {OrganizerDecisionExecutor}=require(path.join(out,'application/orchestration/organizer/OrganizerDecisionExecutor'));
 const {codexOrganizerWireSchema:schema,decodeCodexOrganizerEnvelope:decode}=require(path.join(out,'main/app-server/CodexOrganizerSchema'));
 const {turnFailureDiagnostic}=require(path.join(out,'main/app-server/AppServerDiagnostic'));
 const caps={structuredOutput:true,persistentSessions:true,streaming:false,cancellation:true,toolExecution:false,workingDirectory:true,sandboxing:true};
 const context={teamId:'t',teamName:'Team',organizerAgentId:'a',organizerAgentName:'Agent',conversationId:'c',projectId:'p',projectName:'Project',branch:'main',userRequest:'Plan work',members:[{id:'a',name:'Agent',description:'Plans',runtime:'claude',enabled:true}]};
 await t.test('router selects reusable adapter, rejects unsupported and checks capabilities before calling',()=>{
  const adapter={type:'claude',getCapabilities:()=>caps};const router=new AgentRuntimeRouter([adapter]);assert.equal(router.get('claude'),adapter);assert.equal(router.get('claude'),router.get('claude'));
  assert.throws(()=>router.get('codex'),e=>e.code==='RUNTIME_NOT_SUPPORTED');
  assert.throws(()=>router.get('claude',['toolExecution']),e=>e.code==='RUNTIME_CAPABILITY_MISSING');
  const missing=new AgentRuntimeRouter([{...adapter,getCapabilities:()=>({...caps,structuredOutput:false}),runTurn:()=>assert.fail('must not run')}]);
  assert.throws(()=>missing.runTurn('claude',{},['structuredOutput']),e=>e.code==='RUNTIME_CAPABILITY_MISSING');
 });
 await t.test('fake Claude works through Organizer application; generic session resumes',async()=>{
  const calls=[];const adapter={type:'claude',getCapabilities:()=>caps,cancel:async()=>{},runTurn:async request=>{calls.push(request);return{value:{type:'respond',message:'Hello'},session:request.session??{runtime:'claude',externalSessionId:'fake-session'},durationMs:1}}};
  const app=new OrganizerDecisionExecutor(new AgentRuntimeRouter([adapter]));const input={context,instruction:'Agent instructions',runtime:'claude',settings:{model:null,reasoningEffort:'default'},cwd:root,signal:new AbortController().signal};
  const result=await app.execute(input);assert.deepEqual(result.session,{runtime:'claude',externalSessionId:'fake-session'});assert.equal(result.decision.type,'respond');await app.execute({...input,session:result.session});assert.deepEqual(calls[1].session,result.session);assert.ok(!('outputSchema'in calls[0])&&!('threadId'in calls[0]));
  await assert.rejects(app.execute({...input,session:{runtime:'codex',externalSessionId:'wrong'}}),e=>e.code==='RUNTIME_PROTOCOL_ERROR');
 });
 await t.test('domain/application and presentation models have no infrastructure or protocol dependencies',async()=>{
  async function inspect(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await inspect(file);else if(entry.name.endsWith('.ts')){const text=await fs.readFile(file,'utf8');assert.doesNotMatch(text,/Codex|AppServer|threadId|outputSchema|turn\/start|installationId|executable|from ['"][^'"]*(?:\/main\/|management-api)/,file)}}}
  await inspect(path.join(source,'application'));await inspect(path.join(source,'domain'));
  assert.doesNotMatch(await fs.readFile(path.join(source,'renderer/components/tasks/workspaceTask.ts'),'utf8'),/codex|threadId|Codex/);
 });
 await t.test('wire schema is flat strict object using only supported core keywords',()=>{
  assert.equal(schema.type,'object');for(const key of ['oneOf','anyOf','allOf'])assert.ok(!(key in schema));
  function inspect(s){for(const key of Object.keys(s))assert.ok(['type','properties','required','additionalProperties','items','enum'].includes(key),key);if(s.type==='object'){assert.equal(s.additionalProperties,false);assert.deepEqual([...s.required].sort(),Object.keys(s.properties).sort());Object.values(s.properties).forEach(inspect)}if(s.items)inspect(s.items)}inspect(schema);
 });
 await t.test('all envelopes decode to strong union and unused fields cannot carry data',()=>{
  const blank={type:'respond',message:'Answer',questions:[],planSummary:'',tasks:[]};assert.deepEqual(decode(JSON.stringify(blank)),{type:'respond',message:'Answer'});
  assert.deepEqual(decode(JSON.stringify({...blank,type:'ask_user',questions:['Which framework?']})),{type:'ask_user',message:'Answer',questions:['Which framework?']});
  const task={key:'build',title:'Build',description:'Build it',assigneeAgentId:'a',dependsOn:[],acceptanceCriteria:['Works'],requiresReview:true};const plan={...blank,type:'create_plan',planSummary:'Build',tasks:[task]};assert.equal(decode(JSON.stringify(plan)).tasks[0].key,'build');
  for(const value of [{...blank,questions:['extra']},{...blank,planSummary:'extra'},{...blank,tasks:[task]},{...blank,type:'ask_user',questions:['Q'],tasks:[task]},{...plan,questions:['extra']},{...blank,extra:'SECRET'}, {...blank,type:'ask_user',questions:[]}])assert.throws(()=>decode(JSON.stringify(value)),e=>e.code==='INVALID_STRUCTURED_RESULT'&&!e.message.includes('SECRET'));
 });
 await t.test('safe schema diagnostics omit raw server text',()=>{
  const error=turnFailureDiagnostic({message:'SECRET_TOKEN invalid response_format schema: root must be object',codexErrorInfo:'badRequest'});assert.equal(error.diagnostic.category,'OUTPUT_SCHEMA_REJECTED');assert.ok(!JSON.stringify(error).includes('SECRET_TOKEN'));assert.equal(turnFailureDiagnostic({message:'SECRET_TOKEN unrelated'}).diagnostic.category,'TURN_FAILED');
 });
 await t.test('strict process cleanup waits for exit notification after terminate resolves',async()=>{
  const {EventEmitter}=require('node:events');const {confirmProcessExit}=require(path.join(out,'main/app-server/confirmProcessExit'));
  const child=new EventEmitter();child.exitCode=null;child.signalCode=null;
  let settled=false;const pending=confirmProcessExit(child,async()=>{}).then(()=>settled=true);
  await new Promise(r=>setImmediate(r));assert.equal(settled,false);child.emit('close',0);await pending;assert.equal(child.listenerCount('close'),0);
 });
 await t.test('RPC error classification keeps method and numeric code only; response IDs are distinct',async()=>{
  const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');const {CodexAppServerTransport}=require(path.join(out,'main/app-server/CodexAppServerTransport'));
  for(const mode of ['rpc','id']){
   const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();
   const wire=new CodexAppServerTransport(child,async()=>{});const pending=wire.request('initialize',{clientInfo:{name:'test',title:'test',version:'0'},capabilities:{experimentalApi:false}});
   child.stdout.write(JSON.stringify({id:mode==='id'?999:1,error:{code:-32602,message:'SECRET_RAW server output',data:'SECRET_AUTH'}})+'\n');
   await assert.rejects(pending,error=>{assert.ok(!JSON.stringify(error).includes('SECRET'));assert.equal(error.diagnostic.category,mode==='rpc'?'RPC_ERROR':'RESPONSE_ID_MISMATCH');if(mode==='rpc'){assert.equal(error.diagnostic.protocolCode,-32602);assert.equal(error.diagnostic.method,'initialize')}return true});
   await wire.close();assert.equal(wire.pending.size,0);
  }
 });
});
