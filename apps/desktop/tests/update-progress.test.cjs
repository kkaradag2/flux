const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'../../..'),base=path.join(root,'apps/desktop/.cache/update-progress-tests',String(Date.now()));
test('Codex update feedback',async t=>{
 await fs.mkdir(base,{recursive:true});
 for(const [source,name] of [['main/runtime/CodexRuntimeStateService.ts','CodexRuntimeStateService'],['main/runtime/CodexUpdateService.ts','CodexUpdateService'],...['runtimePresentation','updateProgressPresentation','CodexUpdateProgressView','CodexRuntimeRow'].map(name=>['renderer/components/settings/'+name+(name.startsWith('Codex')?'.tsx':'.ts'),name])]){
  await fs.writeFile(path.join(base,name+'.js'),ts.transpileModule(await fs.readFile(path.join(root,'apps/desktop/src',source),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText);
 }
 const {CodexRuntimeStateService:Service}=require(path.join(base,'CodexRuntimeStateService.js'));
 const {updateStageMessages:messages,elapsedUpdateSeconds}=require(path.join(base,'updateProgressPresentation.js'));
 const {runtimePresentation:present}=require(path.join(base,'runtimePresentation.js'));
 const {CodexRuntimeRow:Row}=require(path.join(base,'CodexRuntimeRow.js'));
 const {createRequire}=require('node:module');const localRequire=createRequire(path.join(root,'apps/desktop/package.json'));const React=localRequire('react'),{renderToStaticMarkup}=localRequire('react-dom/server');
 const render=snapshot=>renderToStaticMarkup(React.createElement(Row,{snapshot,onChoose:()=>{},onUpdate:()=>{},onRetry:()=>{}}));
 const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}};
 const settle=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setImmediate(r))}throw Error('stage did not arrive')};
 async function fixture(){
  let saved={runtime:'codex',cliVersion:'0.151.0',authenticationMethod:'ChatGPT',operationalStatus:'UPDATE_REQUIRED',verificationStatus:'failed',verificationReason:'CLI_TOO_OLD',verifiedAt:'2026-09-15T00:00:00.000Z',updatedAt:'2026-09-15T00:00:00.000Z',updateProblem:null};
  const prep=deferred(),install=deferred(),version=deferred(),verify=deferred();let updating=false,updates=0;
  const repository={load:async()=>saved,save:async value=>{saved={...value}}};
  const healthy=()=>({runtime:'codex',status:'ready',version:'0.154.0',authenticationMethod:'ChatGPT',checkedAt:new Date().toISOString()});
  const health={invalidate:()=>{},refresh:async()=>updating?version.promise:{...healthy(),version:'0.151.0'}};
  const updater={update:async onInstalling=>{updates++;updating=true;await prep.promise;onInstalling();return install.promise},shutdown:async()=>{}};
  const service=new Service(repository,health,{run:()=>verify.promise,shutdown:async()=>{}},updater);await service.inspect();
  return{service,prep,install,version,verify,healthy,updates:()=>updates,saved:()=>saved};
 }
 await t.test('all five stages have the requested human messages',()=>{
  assert.deepEqual(Object.fromEntries(Object.entries(messages).map(([k,v])=>[k,v.message])),{PREPARING:'Preparing the Codex update…',INSTALLING:'Installing the latest Codex version…',CHECKING_VERSION:'Codex was installed. Checking the new version…',VERIFYING_CONNECTION:'Connecting to Codex and verifying the installation…',COMPLETED:'Codex is ready to use.'});assert.equal(messages.INSTALLING.detail,'This may take a minute.');
 });
 await t.test('real operation boundaries produce ordered stages and shared elapsed origin; re-entry shares work',async()=>{
  const f=await fixture(),order=[];const run=f.service.update();await settle(()=>f.service.snapshot().updateProgress?.stage==='PREPARING');
  const startedAt=f.service.snapshot().updateProgress.startedAt;const capture=()=>{const snapshot=f.service.snapshot();order.push(snapshot.updateProgress.stage);assert.equal(snapshot.updateProgress.startedAt,startedAt);return snapshot};capture();
  f.prep.resolve();await settle(()=>f.service.snapshot().updateProgress?.stage==='INSTALLING');const during=capture();assert.equal(f.service.update(),run);assert.equal(f.service.inspect(),run);assert.equal(f.updates(),1);
  assert.equal(f.service.snapshot().updateProgress.stage,during.updateProgress.stage);during.updateProgress.stage='COMPLETED';assert.equal(f.service.snapshot().updateProgress.stage,'INSTALLING');
  f.install.resolve(null);await settle(()=>f.service.snapshot().updateProgress?.stage==='CHECKING_VERSION');capture();f.version.resolve(f.healthy());await settle(()=>f.service.snapshot().updateProgress?.stage==='VERIFYING_CONNECTION');capture();
  f.verify.resolve({status:'passed',response:'Hello from Flux.',verificationReason:null,checkedAt:new Date().toISOString()});const final=await run;order.push(final.updateProgress.stage);assert.deepEqual(order,['PREPARING','INSTALLING','CHECKING_VERSION','VERIFYING_CONNECTION','COMPLETED']);assert.equal(final.activity,null);assert.equal(final.state.operationalStatus,'READY');assert.equal(present(final).showUpdateProgress,false);assert.ok(!render(final).includes('role="progressbar"'));assert.ok(!('updateProgress' in f.saved()));
 });
 await t.test('every active stage renders spinner and indeterminate bar, no update button or fake percentage',async()=>{
  const f=await fixture();const state=f.service.snapshot().state;
  for(const stage of ['PREPARING','INSTALLING','CHECKING_VERSION','VERIFYING_CONNECTION']){const snapshot={state,activity:'updating',updateProgress:{stage,startedAt:new Date(Date.now()-18000).toISOString()}};const html=render(snapshot);assert.ok(html.includes(messages[stage].message));assert.ok(html.includes('runtime-update-spinner'));assert.ok(html.includes('role="progressbar"'));assert.ok(!html.includes('aria-valuenow'));assert.ok(!html.includes('Updating…'));assert.ok(!html.includes('>Update Codex<'));assert.ok(!html.includes('Step '));assert.ok(html.includes('18s elapsed'));assert.equal(present(snapshot).canUpdate,false)}
 });
 for(const failure of ['install','version','verification'])await t.test(failure+' failure stops progress and returns normal error feedback',async()=>{
  const f=await fixture();const run=f.service.update();await settle(()=>f.service.snapshot().updateProgress?.stage==='PREPARING');f.prep.resolve();await settle(()=>f.service.snapshot().updateProgress?.stage==='INSTALLING');f.install.resolve(failure==='install'?'UPDATE_FAILED':null);
  if(failure!=='install'){await settle(()=>f.service.snapshot().updateProgress?.stage==='CHECKING_VERSION');f.version.resolve(failure==='version'?{...f.healthy(),status:'error'}:f.healthy());if(failure==='verification'){await settle(()=>f.service.snapshot().updateProgress?.stage==='VERIFYING_CONNECTION');f.verify.resolve({status:'failed',response:null,verificationReason:'VERIFICATION_TIMEOUT',checkedAt:new Date().toISOString()})}}
  const result=await run;assert.equal(result.activity,null);assert.equal(result.updateProgress,null);assert.notEqual(result.state.operationalStatus,'READY');assert.equal(present(result).showUpdateProgress,false);assert.ok(!render(result).includes('role="progressbar"'));assert.ok(!render(result).includes('runtime-update-spinner'));
 });
 await t.test('elapsed is wall-clock based, clamps clock changes and updates slower than once a second',async()=>{
  assert.equal(elapsedUpdateSeconds('2026-09-15T00:00:00.000Z',Date.parse('2026-09-15T00:00:18.999Z')),18);assert.equal(elapsedUpdateSeconds('bad',0),0);assert.equal(elapsedUpdateSeconds('2026-09-15T00:00:00.000Z',0),0);
  const view=await fs.readFile(path.join(root,'apps/desktop/src/renderer/components/settings/CodexUpdateProgressView.tsx'),'utf8');assert.ok(view.includes('5000'));assert.ok(view.includes('clearInterval(timer)'));
 });
 await t.test('installer observer fires after spawn and cannot break process completion',async()=>{
  const {CodexUpdateService:Updater}=require(path.join(base,'CodexUpdateService.js'));const {EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();let spawned=false,observed=0;
  const updater=new Updater({startNpmUpdate:()=>{spawned=true;return child}},{updateTarget:async()=>({})});const run=updater.update(()=>{assert.equal(spawned,true);observed++;throw Error('observer failure')});await settle(()=>observed===1);child.emit('close',0);assert.equal(await run,null);assert.equal(child.listenerCount('close'),0);
 });
});
