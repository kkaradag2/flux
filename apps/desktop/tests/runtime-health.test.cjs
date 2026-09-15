const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const base = path.join(root, '.cache/runtime-tests', String(Date.now()));
const success = (stdout='', stderr='') => ({ stdout, stderr, exitCode:0, timedOut:false, failed:false });
test('Codex runtime health without a Codex installation', async t => {
 await fs.mkdir(base,{recursive:true});
 for(const file of await fs.readdir(path.join(root,'apps/desktop/src/main/runtime'))) {
  if(!file.endsWith('.ts') || file==='registerRuntimeHealthIpc.ts')continue;
  const source=await fs.readFile(path.join(root,'apps/desktop/src/main/runtime',file),'utf8');
  await fs.writeFile(path.join(base,file.replace(/\.ts$/,'.js')),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText);
 }
 const {CodexRuntimeProbe}=require(path.join(base,'CodexRuntimeProbe.js'));
 const {RuntimeHealthService}=require(path.join(base,'RuntimeHealthService.js'));
 const {RuntimeCommandRunner}=require(path.join(base,'RuntimeCommandRunner.js'));
 const {windowsShimCommand}=require(path.join(base,'WindowsShimAdapter.js'));
 const probe=(results,executable='/mock/codex')=>{const calls=[];return {calls,probe:new CodexRuntimeProbe({resolveCodex:async()=>executable,run:async(file,command,timeout)=>{calls.push({command,timeout});return results.shift();}})}};
 await t.test('not installed',async()=>{const p=probe([],null);const value=await p.probe.check();assert.equal(value.status,'not-installed');assert.equal(value.version,null);assert.equal(value.authenticationMethod,null);assert.equal(p.calls.length,0)});
 await t.test('ready, version, safe authentication method and timeouts',async()=>{const p=probe([success('codex-cli 0.151.0\n'),success('','Logged in using ChatGPT')]);const result=await p.probe.check();assert.equal(result.status,'ready');assert.equal(result.version,'0.151.0');assert.equal(result.authenticationMethod,'ChatGPT');assert.deepEqual(p.calls,[{command:'version',timeout:5000},{command:'login-status',timeout:10000}]);assert.ok(Date.parse(result.checkedAt));});
 await t.test('auth nonzero status requires sign-in',async()=>{const {probe:p}=probe([success('codex-cli 0.151.0'),{...success('','Not logged in'),exitCode:1}]);const result=await p.check();assert.equal(result.status,'not-authenticated');assert.equal(result.version,'0.151.0');assert.equal(result.authenticationMethod,null);});
 await t.test('version timeout',async()=>{const p=probe([{...success(),timedOut:true}]);assert.equal((await p.probe.check()).status,'error');assert.equal(p.calls.length,1);});
 await t.test('auth timeout',async()=>{const p=probe([success('codex-cli 0.151.0'),{...success(),timedOut:true}]);const result=await p.probe.check();assert.equal(result.status,'error');assert.match(result.message,/10 seconds/);});
 await t.test('raw output, secrets and unexpected errors never leave the probe',async()=>{const secret='sk-private-sentinel-value';for(const auth of [{...success('',secret),exitCode:2},success('','Logged in using an API key - '+secret),success('unexpected '+secret)]){const p=probe([success('codex-cli 0.151.0',secret),auth]);const result=await p.probe.check();assert.ok(!JSON.stringify(result).includes(secret));if(auth.exitCode===2)assert.equal(result.status,'error');else assert.equal(result.status,'ready');}const thrown=new CodexRuntimeProbe({resolveCodex:async()=>{throw Error(secret)}});assert.ok(!JSON.stringify(await thrown.check()).includes(secret));const bad=probe([success('codex-cli 1.2.3-'+secret)]);assert.equal((await bad.probe.check()).version,null);});
 await t.test('concurrent calls share one promise and cached result',async()=>{let resolve;let count=0;const service=new RuntimeHealthService({check:()=>{count++;return new Promise(r=>resolve=r)}});const a=service.get(),b=service.refresh(),c=service.get();assert.equal(a,b);assert.equal(a,c);assert.equal(count,1);resolve({status:'ready'});await a;await service.get();assert.equal(count,1);});
 await t.test('refresh starts a fresh check',async()=>{let count=0;const service=new RuntimeHealthService({check:async()=>({status:'ready',checkedAt:String(++count)})});await service.get();await service.get();assert.equal(count,1);assert.equal((await service.refresh()).checkedAt,'2');});
 await t.test('Windows shim quotes fixed paths and rejects expansion/injection',()=>{const command=windowsShimCommand('C:\\Program Files\\Codex\\codex.cmd','login-status','C:\\Windows');assert.equal(command.args.at(-1),'""C:\\Program Files\\Codex\\codex.cmd" login status"');for(const unsafe of ['C:\\bad%PATH%\\codex.cmd','C:\\bad&run\\codex.cmd','C:\\bad!name\\codex.cmd','relative\\codex.cmd'])assert.throws(()=>windowsShimCommand(unsafe,'version','C:\\Windows'));assert.throws(()=>windowsShimCommand('C:\\safe\\codex.cmd','prompt','C:\\Windows'));});
 await t.test('real Windows shim timeout terminates child process tree', {skip:process.platform!=='win32'},async()=>{
  const folder=path.join(base,'shim with spaces');await fs.mkdir(folder);const shim=path.join(folder,'codex.cmd');
  await fs.writeFile(path.join(folder,'long.cjs'),'console.log(process.pid);setInterval(()=>{},1000);');
  await fs.writeFile(shim,'@echo off\r\nnode "%~dp0long.cjs"\r\n');
  const runner=new RuntimeCommandRunner();const result=await runner.run(shim,'version',500);assert.equal(result.timedOut,true);const pid=Number(result.stdout.trim());assert.ok(pid>0);await new Promise(r=>setTimeout(r,100));assert.throws(()=>process.kill(pid,0));
  await fs.writeFile(shim,'@echo off\r\necho codex-cli 1.2.3\r\n');const ok=await runner.run(shim,'version',5000);assert.equal(ok.exitCode,0);assert.match(ok.stdout,/codex-cli 1.2.3/);
 });
});
