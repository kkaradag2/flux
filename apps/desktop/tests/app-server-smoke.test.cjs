const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const ts = require('typescript');
const root = path.resolve(__dirname,'../../..');
const base = path.join(root,'.cache/app-server-tests',String(Date.now()));
test('Codex App Server smoke test', async t => {
 await fs.mkdir(base,{recursive:true});
 for(const file of await fs.readdir(path.join(root,'apps/desktop/src/main/app-server'))) {
  if(!file.endsWith('.ts') || file.startsWith('register'))continue;
  const source=await fs.readFile(path.join(root,'apps/desktop/src/main/app-server',file),'utf8');
  await fs.writeFile(path.join(base,file.replace(/\.ts$/,'.js')),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText);
 }
 const {CodexAppServerTransport}=require(path.join(base,'CodexAppServerTransport.js'));
 const {CodexAppServerClient}=require(path.join(base,'CodexAppServerClient.js'));
 const {CodexSmokeTestService}=require(path.join(base,'CodexSmokeTestService.js'));
 const {SMOKE_PROMPT}=require(path.join(base,'contracts.js'));
 const fixtures=[];
 function fixture(mode='success') {
  const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();let killed=0;const sent=[];
  const send=value=>child.stdout.write(JSON.stringify(value)+'\n');
  const turn=(text='Hello from Flux.',status='completed')=>{
   const events=[{method:'item/agentMessage/delta',params:{threadId:'thread',turnId:'turn',itemId:'answer',delta:'Hello '}},{method:'item/completed',params:{threadId:'thread',turnId:'turn',item:{type:'agentMessage',id:'answer',text,phase:'final_answer'}}},{method:'turn/completed',params:{threadId:'thread',turn:{id:'turn',status,items:[]}}}];
   const bytes=Buffer.from(events.map(e=>JSON.stringify(e)).join('\n')+'\n');child.stdout.write(bytes.subarray(0,19));child.stdout.write(bytes.subarray(19,63));child.stdout.write(bytes.subarray(63));
  };
  child.stdin=new Writable({write(chunk,encoding,callback){const message=JSON.parse(chunk.toString());sent.push(message);callback();queueMicrotask(()=>{
   if(!message.method)return;
   if(message.method==='initialize') {if(mode==='malformed'){child.stdout.write('secret invalid JSON\n');return;}if(mode==='exit'){child.emit('close',1);return;}if(mode==='timeout')return;send({id:message.id,result:{userAgent:'codex-cli 0.151.0'}});}
   if(message.method==='thread/start')send({id:message.id,result:{thread:{id:'thread'},approvalPolicy:'never',sandbox:{type:'readOnly'}}});
   if(message.method==='turn/start') {
    send({id:message.id,result:{turn:{id:'turn'}}});
    if(mode==='approval') {send({id:99,method:'item/commandExecution/requestApproval',params:{}});turn();return;}
    if(mode==='tool'){send({method:'item/started',params:{threadId:'thread',turnId:'turn',item:{id:'tool',type:'commandExecution'}}});return;}
    if(mode==='incompatible'){send({method:'turn/completed',params:{threadId:'thread',turn:{id:'turn',status:'failed',items:[],error:{message:'The selected model requires a newer version of Codex. sk-secret'}}}});return;}if(mode==='wrong')turn('sk-sensitive-unexpected');else if(mode==='failed')turn('', 'failed');else turn();
   }
  });}});
  const wire=new CodexAppServerTransport(child,async()=>{killed++;child.emit('close',0)});
  const f={child,wire,sent,killed:()=>killed,client:new CodexAppServerClient(async()=>wire)};fixtures.push(f);return f;
 }
 await t.test('initialize then initialized; ephemeral read-only fixed hello with defaults',async()=>{const f=fixture();const service=new CodexSmokeTestService(f.client,root);const result=await service.run();assert.equal(result.status,'passed');assert.equal(result.response,'Hello from Flux.');assert.deepEqual(f.sent.filter(m=>m.method).map(m=>m.method),['initialize','initialized','thread/start','turn/start']);const thread=f.sent.find(m=>m.method==='thread/start').params;assert.equal(thread.ephemeral,true);assert.equal(thread.sandbox,'read-only');assert.equal(thread.approvalPolicy,'never');const turn=f.sent.find(m=>m.method==='turn/start').params;assert.deepEqual(turn.sandboxPolicy,{type:'readOnly',networkAccess:false});assert.equal(turn.input[0].text,SMOKE_PROMPT);assert.ok(!('model'in thread)&&!('effort'in turn));assert.equal(f.killed(),1);});
 await t.test('out-of-order response IDs matched; fragmented UTF8 and multiple JSONL',async()=>{const f=fixture('timeout');const first=f.wire.request('initialize',{}),second=f.wire.request('thread/start',{});await new Promise(r=>setImmediate(r)); // discard fixture's thread reply by using IDs carefully
  // second is answered by fixture. first remains pending; feed a fragmented response.
  const bytes=Buffer.from(JSON.stringify({id:1,result:{value:'😀'}})+'\n'+JSON.stringify({method:'notice',params:{}})+'\n');const split=bytes.indexOf(Buffer.from('😀'))+2;f.child.stdout.write(bytes.subarray(0,split));f.child.stdout.write(bytes.subarray(split));assert.deepEqual(await first,{value:'😀'});assert.equal((await second).thread.id,'thread');await f.wire.close();});
 for(const [mode,code] of [['wrong','UNEXPECTED_RESPONSE'],['failed','TURN_FAILED'],['malformed','PROTOCOL_ERROR'],['exit','PROCESS_EXIT'],['tool','TOOL_REQUESTED'],['incompatible','RUNTIME_INCOMPATIBLE']])await t.test(mode+' fails safely',async()=>{const f=fixture(mode);f.child.stderr.write('sk-private-secret on stderr');const result=await new CodexSmokeTestService(f.client,root).run();assert.equal(result.errorCode,code);assert.equal(result.response,null);assert.ok(!JSON.stringify(result).includes('secret')&&!JSON.stringify(result).includes('sk-'));assert.equal(f.killed(),1);});
 await t.test('approval is declined before cleanup even with racing completed turn',async()=>{const f=fixture('approval');const result=await new CodexSmokeTestService(f.client,root).run();assert.equal(result.errorCode,'APPROVAL_REQUESTED');assert.deepEqual(f.sent.find(m=>m.id===99),{id:99,result:{decision:'decline'}});assert.equal(f.killed(),1);});
 await t.test('timeout cancels request and cleans up',async()=>{const f=fixture('timeout');const result=await new CodexSmokeTestService(f.client,root,20).run();assert.equal(result.errorCode,'TIMEOUT');assert.equal(f.killed(),1);});
 await t.test('shutdown waits for cleanup',async()=>{const f=fixture('timeout');const service=new CodexSmokeTestService(f.client,root);const run=service.run();await new Promise(r=>setTimeout(r,5));assert.equal(service.running,true);await service.shutdown();assert.equal((await run).errorCode,'CANCELLED');assert.equal(f.killed(),1);assert.equal(service.running,false);});
 await t.test('explicit cancellation cleans up',async()=>{const f=fixture('timeout');const service=new CodexSmokeTestService(f.client,root);const pending=service.run();setTimeout(()=>service.cancel(),5);assert.equal((await pending).errorCode,'CANCELLED');assert.equal(f.killed(),1);});
 await t.test('concurrent calls share exactly one test',async()=>{const f=fixture();const service=new CodexSmokeTestService(f.client,root);const a=service.run(),b=service.run();assert.equal(a,b);await a;assert.equal(f.sent.filter(m=>m.method==='turn/start').length,1);});
 await t.test('unknown response ID reports controlled protocol failure',async()=>{const f=fixture('timeout');let failure;f.wire.onFailure(e=>failure=e);f.child.stdout.write('{"id":999,"result":{}}\n');assert.equal(failure.code,'PROTOCOL_ERROR');await f.wire.close();});
 await t.test('all child streams and listeners cleaned after completion',()=>{for(const f of fixtures){assert.equal(f.killed(),1);assert.equal(f.child.listenerCount('error'),0);assert.equal(f.child.listenerCount('close'),0);assert.equal(f.child.stdout.listenerCount('data'),0);assert.equal(f.child.stderr.listenerCount('data'),0);assert.equal(f.child.stdin.listenerCount('error'),0);assert.ok(f.child.stdin.destroyed&&f.child.stdout.destroyed&&f.child.stderr.destroyed);}});
});
