const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),ts=require('typescript');
test('Codex 0.154.0 runtime preparation',async t=>{
 const parent=path.resolve('.cache/preparation-tests');await fs.mkdir(parent,{recursive:true});const base=await fs.mkdtemp(path.join(parent,'case-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 async function compile(dir){for(const e of await fs.readdir('apps/desktop/src/'+dir,{withFileTypes:true})){const f=dir+'/'+e.name;if(e.isDirectory())await compile(f);else if(f.endsWith('.ts')&&!f.endsWith('.d.ts')){const out=path.join(base,f.replace(/\.ts$/,'.js'));await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,ts.transpileModule(await fs.readFile('apps/desktop/src/'+f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)}}}
 for(const dir of ['main/app-server','application','domain','shared'])await compile(dir);
 const {verifyTaskThreadPolicy,verifyManagedWorkingDirectory,preparationError}=require(path.join(base,'main/app-server/RuntimePreparation'));
 const {CodexChatSession}=require(path.join(base,'main/app-server/CodexChatSession'));
 const cwd=path.join(base,'managed','run');await fs.mkdir(cwd,{recursive:true});
 const response=()=>({cwd,thread:{id:'fixture-thread'},approvalPolicy:'never',sandbox:{type:'workspaceWrite',writableRoots:[],networkAccess:false,excludeTmpdirEnvVar:true,excludeSlashTmp:true}});
 await t.test('implicit cwd and redundant explicit cwd accepted; no additional writable location accepted',()=>{verifyTaskThreadPolicy(response(),cwd);const r=response();r.sandbox.writableRoots=[cwd];verifyTaskThreadPolicy(r,cwd);r.sandbox.writableRoots=[base];assert.throws(()=>verifyTaskThreadPolicy(r,cwd),e=>e.diagnostic.subcode==='sandbox_policy_invalid'&&e.diagnostic.field==='writableRoots');});
 for(const [label,change,code,field] of [
  ['malformed',r=>{r.sandbox=null},'generated_contract_mismatch','sandbox'],
  ['cwd',r=>{r.cwd=base},'workspace_identity_mismatch','cwd'],
  ['approval',r=>{r.approvalPolicy='on-request'},'thread_policy_mismatch','approvalPolicy'],
  ['type',r=>{r.sandbox.type='dangerFullAccess'},'thread_policy_mismatch','sandbox'],
  ['network',r=>{r.sandbox.networkAccess=true},'sandbox_policy_invalid','networkAccess'],
  ['tmpdir',r=>{r.sandbox.excludeTmpdirEnvVar=false},'sandbox_policy_invalid','excludeTmpdirEnvVar'],
  ['tmp',r=>{r.sandbox.excludeSlashTmp=false},'sandbox_policy_invalid','excludeSlashTmp'],
  ['roots',r=>{r.sandbox.writableRoots=null},'sandbox_policy_invalid','writableRoots']
 ])await t.test(label+' rejected with allowlisted diagnostic',()=>{const r=response();change(r);assert.throws(()=>verifyTaskThreadPolicy(r,cwd),e=>{assert.equal(e.diagnostic.subcode,code);assert.equal(e.diagnostic.field,field);assert.ok(!JSON.stringify(e).includes(cwd));return true})});
 await t.test('managed identity accepts exact directory, rejects outside root, wrong identity and missing cwd',async()=>{
  const root=path.dirname(cwd);await verifyManagedWorkingDirectory(cwd,root,cwd);
  for(const [input,expected,code] of [[base,base,'workspace_outside_managed_root'],[cwd,base,'workspace_identity_mismatch'],[path.join(root,'missing'),path.join(root,'missing'),'invalid_working_directory'],['relative','relative','invalid_working_directory']])await assert.rejects(verifyManagedWorkingDirectory(input,root,expected),e=>e.diagnostic.subcode===code);
 });
 function fixture(value=response(),fail=false){const calls=[],listeners=new Set();let closes=0;const wire={request:async(method,params)=>{calls.push({method,params});if(method==='initialize')return{userAgent:'fixture'};if(method==='mcpServerStatus/list')return{data:[],nextCursor:null};if(method==='thread/start'){if(fail)throw preparationError('thread_start_rejected',undefined,-32602);return value}throw Error('Unexpected method');},notify:async method=>{calls.push({method})},reply:async()=>{},close:async()=>{closes++;listeners.clear()},onNotification:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},onRequest:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},onFailure:fn=>{listeners.add(fn);return()=>listeners.delete(fn)}};
 return {session:new CodexChatSession(async()=>wire,{outputSchema:{type:'object'},taskExecution:true}),calls,listeners,closes:()=>closes};}
 await t.test('preflight shares real preparation, creates ephemeral thread, never turns or saves sessions, cleans listeners',async()=>{
  const f=fixture(),stages=[],records={task:'failed',attempts:2,session:null},before=JSON.stringify(records);let callbacks=0;
  await f.session.preflight({cwd,instructions:'fixture instructions',runtime:{type:'codex',model:null,reasoningEffort:'default'},onThread:()=>{callbacks++},onExecutionStarted:()=>{callbacks++}},new AbortController().signal,s=>stages.push(s));
  assert.deepEqual(f.calls.map(c=>c.method),['initialize','initialized','mcpServerStatus/list','thread/start','mcpServerStatus/list']);assert.equal(callbacks,0);assert.equal(JSON.stringify(records),before);assert.equal(f.listeners.size,0);assert.ok(f.closes()>0);
  assert.deepEqual(stages,['CWD accepted','Sandbox request accepted','Thread started','Returned policy verified','Cleanup completed']);
  const params=f.calls.find(c=>c.method==='thread/start').params;assert.equal(params.ephemeral,true);assert.equal(params.sandbox,'workspace-write');assert.equal(params.approvalPolicy,'never');assert.ok(!('model' in params));assert.deepEqual(params.config['sandbox_workspace_write.writable_roots'],[cwd]);assert.equal(params.config['sandbox_workspace_write.network_access'],false);assert.equal(params.config['sandbox_workspace_write.exclude_tmpdir_env_var'],true);assert.equal(params.config['sandbox_workspace_write.exclude_slash_tmp'],true);
 });
 for(const kind of ['policy','thread','rpc'])await t.test(kind+' failure cleans without turn or session publication',async()=>{const r=response();if(kind==='policy')r.sandbox.networkAccess=true;if(kind==='thread')r.thread=null;const f=fixture(r,kind==='rpc'),stages=[];await assert.rejects(f.session.preflight({cwd,instructions:'',runtime:{type:'codex',model:null,reasoningEffort:'default'}},new AbortController().signal,s=>stages.push(s)),e=>!!e.diagnostic);assert.equal(f.listeners.size,0);assert.ok(f.closes()>0);assert.equal(stages.at(-1),'Cleanup completed');assert.ok(!f.calls.some(c=>c.method==='turn/start'));});
 await t.test('adapter emits distinct source/capability/version diagnostics without changing public failures',async()=>{
  const {CodexAgentRuntimeAdapter}=require(path.join(base,'main/app-server/CodexAgentRuntimeAdapter'));
  for(const [kind,resolved] of [['installation_not_ready',null],['unsupported_runtime_version',{structuredOutput:false}],['runtime_capability_missing',null]]){
   const diagnostics=[],adapter=new CodexAgentRuntimeAdapter({resolve:async()=>resolved},1000,d=>diagnostics.push(d));
   await assert.rejects(adapter.runTurn({resultContract:'task-execution',cwd,settings:{model:null,reasoningEffort:'default'},policy:{readOnly:false,tools:true,network:kind==='runtime_capability_missing'},signal:new AbortController().signal}));assert.equal(diagnostics[0].subcode,kind);assert.ok(!JSON.stringify(diagnostics).includes(cwd));
  }
 });
 await t.test('typed main preflight has no persistence port; failures expose only fixed diagnostics',async()=>{
  const {CodexRuntimePreflight}=require(path.join(base,'main/app-server/CodexRuntimePreflight'));
  const options={cwd,managedRoot:path.dirname(cwd),expectedCwd:cwd,instructions:'fixture instructions',runtime:{type:'codex',model:null,reasoningEffort:'default'}};
  const f=fixture();let creates=0;
  const result=await new CodexRuntimePreflight({resolve:async()=>({structuredOutput:true,client:{createStructuredSession:()=>{creates++;return f.session}}})}).check(options);
  assert.equal(result.passed,true);assert.equal(creates,1);assert.equal(result.stages.length,7);assert.equal(result.diagnostic,null);assert.ok(!JSON.stringify(result).includes(cwd));assert.ok(!JSON.stringify(result).includes('fixture instructions'));
  for(const [resolve,code] of [[async()=>null,'installation_not_ready'],[async()=>({structuredOutput:false}),'unsupported_runtime_version'],[async()=>{throw Error('untrusted failure')},'unknown_validation_failure']]){
   const failed=await new CodexRuntimePreflight({resolve}).check(options);assert.equal(failed.passed,false);assert.equal(failed.diagnostic.subcode,code);assert.equal(failed.stages.at(-1),'Cleanup completed');assert.ok(!JSON.stringify(failed).includes('untrusted failure'));
  }
 });

});

