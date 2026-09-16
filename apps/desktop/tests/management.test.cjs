const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const base = path.join(root, '.cache/management-tests', String(Date.now()));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=', 'base64');
test('Agents and Teams management', async t => {
 for (const folder of ['main/management', 'main/persistence', 'shared']) {
  const target = path.join(base, folder); await fs.mkdir(target, { recursive: true });
  for (const file of await fs.readdir(path.join(root, 'apps/desktop/src', folder))) {
   if (!file.endsWith('.ts') || file === 'registerManagementIpc.ts') continue;
   const source = await fs.readFile(path.join(root, 'apps/desktop/src', folder, file), 'utf8');
   await fs.writeFile(path.join(target, file.replace(/\.ts$/, '.js')), ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText);
  }
 }
 const load = name => require(path.join(base, 'main/management', name + '.js'))[name];
 const AgentService = load('AgentService'), TeamService = load('TeamService'), JsonAgentRepository = load('JsonAgentRepository'), JsonTeamRepository = load('JsonTeamRepository'), AgentAssetService = load('AgentAssetService');
 const assets = new AgentAssetService(path.join(base, 'avatars'), buffer => buffer.length > 20);
 const agentFile = path.join(base, 'agents.json'), teamFile = path.join(base, 'teams.json');
 let agents = new AgentService(new JsonAgentRepository(agentFile), assets), teams = new TeamService(new JsonTeamRepository(teamFile), agents);
 const input = { name: '  Assistant  ', description: 'Test agent', avatar: { type: 'builtin', value: 'shield' }, runtime: { type: 'codex', model: null, reasoningEffort: 'high' }, instructionsMarkdown: '# Test\n\n- Work', enabled: false };
 let created, team, imageId;
 await t.test('seeds four agents and Core Team only once', async () => { assert.deepEqual((await agents.getAgents()).map(a=>a.id), ['lead','developer','reviewer','tester']); assert.deepEqual((await teams.getTeams())[0].agentIds, ['lead','developer','reviewer','tester']); const old = await fs.readFile(agentFile, 'utf8'); await agents.getAgents(); assert.equal(await fs.readFile(agentFile, 'utf8'), old); });
 await t.test('builtin Lead migration is exact, atomic and idempotent', async () => {
  const { defaultAgents } = require(path.join(base, 'main/management/defaults.js'));
  const { leadInstructions } = require(path.join(base, 'main/management/leadInstructions.js'));
  assert.equal(defaultAgents()[0].instructionsMarkdown, leadInstructions);
  assert.doesNotMatch(leadInstructions, /Developer|Tester|Reviewer|PASS|build|Git|review and test/);
  const prefix = '# Responsibilities\n\n- Analyze the user request.\n- Convert the request into clear, testable tasks.\n- Assign tasks to appropriate agents.\n- Track dependencies and blockers.\n- Coordinate the team until verification is complete.\n';
  for (const ending of ['- Do not mark work complete without review and test evidence.', '- Do not mark work complete without evidence that its expected outcomes were produced.']) {
   const file = path.join(base, 'migration-' + ending.length + '.json');
   const legacy = prefix + ending;
   const records = defaultAgents(); records[0].instructionsMarkdown = legacy; records[0].name = 'Coordinator';
   records.push({ ...records[0], id: 'custom-lead', name: 'Lead' });
   await fs.writeFile(file, JSON.stringify(records));
   const original = await fs.readFile(file, 'utf8'), rename = fs.rename;
   fs.rename = async () => { throw new Error('replacement failure'); };
   try { await assert.rejects(new JsonAgentRepository(file).list(), /previous data/); } finally { fs.rename = rename; }
   assert.equal(await fs.readFile(file, 'utf8'), original);
   const migrated = await new JsonAgentRepository(file).list();
   assert.equal(migrated[0].instructionsMarkdown, leadInstructions);
   assert.deepEqual({ ...migrated[0], instructionsMarkdown: legacy, updatedAt: records[0].updatedAt }, records[0]);
   assert.deepEqual(migrated.slice(1), records.slice(1));
   const stable = await fs.readFile(file, 'utf8'), stat = await fs.stat(file);
   await new JsonAgentRepository(file).list();
   assert.equal(await fs.readFile(file, 'utf8'), stable); assert.equal((await fs.stat(file)).mtimeMs, stat.mtimeMs);
   records[0].name = 'Lead'; records[0].instructionsMarkdown = legacy + '\nCustom instruction';
   await fs.writeFile(file, JSON.stringify(records));
   assert.deepEqual(await new JsonAgentRepository(file).list(), records);
  }
 });
 await t.test('agent create, trim, update, immutable identity and timestamps', async () => { created = await agents.createAgent(input); assert.equal(created.name,'Assistant'); const updated = await agents.updateAgent(created.id,{...input,name:'Updated'}); assert.equal(updated.id,created.id); assert.equal(updated.createdAt,created.createdAt); for(const key of ['id','createdAt','updatedAt']) await assert.rejects(agents.updateAgent(created.id,{...input,[key]:'changed'}), /cannot be supplied/); });
 await t.test('invalid agent fields rejected in main', async () => { for(const change of [{name:' '},{runtime:{...input.runtime,type:'other'}},{runtime:{...input.runtime,reasoningEffort:'extreme'}},{enabled:'yes'},{avatar:{type:'builtin',value:'unknown'}}]) await assert.rejects(agents.createAgent({...input,...change})); });
 await t.test('supported avatar copied with safe ID and data URL', async () => { const source = path.join(base,'source.png'); await fs.writeFile(source,png); imageId = await assets.importImage(source); assert.match(imageId,/^[a-f0-9-]{36}\.png$/); assert.match(await assets.getDataUrl(imageId),/^data:image\/png;base64,/); await agents.updateAgent(created.id,{...input,avatar:{type:'image',assetId:imageId}}); const json = await fs.readFile(agentFile,'utf8'); assert.ok(!json.includes('base64') && !json.includes(source) && json.includes(imageId)); });
 await t.test('avatar format, contents, size and traversal rejected', async () => { const bad=path.join(base,'bad.svg');await fs.writeFile(bad,'<svg/>');await assert.rejects(assets.importImage(bad),/PNG/); const fake=path.join(base,'fake.png');await fs.writeFile(fake,'not a picture');await assert.rejects(assets.importImage(fake),/valid supported/);const large=path.join(base,'large.png');await fs.writeFile(large,Buffer.alloc(2*1024*1024+1));await assert.rejects(assets.importImage(large),/2 MB/);await assert.rejects(assets.getDataUrl('../agents.json'),/asset ID/);await assert.rejects(assets.getDataUrl('C:\\source.png'),/asset ID/); });
 await t.test('team create and ordered membership updates', async () => {team=await teams.createTeam({name:' Test team ',description:'Test',agentIds:[created.id,'lead'],organizerAgentId:'lead'});assert.equal(team.name,'Test team');const changed=await teams.updateTeam(team.id,{name:'Changed',description:'',agentIds:['lead',created.id],organizerAgentId:'lead'});assert.deepEqual(changed.agentIds,['lead',created.id]);assert.equal(changed.createdAt,team.createdAt);for(const key of ['id','createdAt','updatedAt'])await assert.rejects(teams.updateTeam(team.id,{name:'Team',description:'',agentIds:['lead'],[key]:'changed'}));});
 await t.test('invalid, duplicate and empty memberships rejected',async()=>{for(const ids of [[],['lead','lead'],['missing']])await assert.rejects(teams.createTeam({name:'Team',description:'',agentIds:ids}));await assert.rejects(teams.createTeam({name:' ',description:'',agentIds:['lead']}));});
 await t.test('reopened services retain records and avatars',async()=>{agents=new AgentService(new JsonAgentRepository(agentFile),assets);teams=new TeamService(new JsonTeamRepository(teamFile),agents);assert.equal((await agents.getAgent(created.id)).avatar.assetId,imageId);assert.deepEqual((await teams.getTeam(team.id)).agentIds,['lead',created.id]);});
 await t.test('concurrent creates do not lose records',async()=>{const before=(await agents.getAgents()).length;await Promise.all([agents.createAgent(input),agents.createAgent(input)]);assert.equal((await agents.getAgents()).length,before+2);});
 await t.test('broken JSON preserved for both repositories',async()=>{for(const [name,Repo] of [['broken-agents.json',JsonAgentRepository],['broken-teams.json',JsonTeamRepository]]){const file=path.join(base,name);await fs.writeFile(file,'{broken');await assert.rejects(new Repo(file).list(),/original file/);assert.equal(await fs.readFile(file,'utf8'),'{broken');}});
 await t.test('failed atomic replacement preserves previous file',async()=>{const before=await fs.readFile(agentFile,'utf8');const original=fs.rename;fs.rename=async()=>{throw new Error('simulated write failure')};try{await assert.rejects(agents.createAgent(input),/previous data/);}finally{fs.rename=original;}assert.equal(await fs.readFile(agentFile,'utf8'),before);});
 await fs.writeFile(path.join(root,'.cache/management-fixture.json'),JSON.stringify({base,source:path.join(base,'source.png'),large:path.join(base,'large.png')}));
});
