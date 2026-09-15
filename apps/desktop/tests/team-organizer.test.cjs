const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

test('Team Organizer validation, migration and presentation', async t => {
 const root = path.resolve(__dirname, '../../..');
 const parent = path.join(root, '.cache/team-organizer-tests');
 await fs.mkdir(parent, { recursive: true });
 const base = await fs.mkdtemp(path.join(parent, 'run-'));
 t.after(() => fs.rm(base, { recursive: true, force: true }));
 const src = path.join(root, 'apps/desktop/src');
 const files = ['main/persistence/AtomicFileWriter.ts'];
 for (const folder of ['main/management', 'shared']) for (const file of await fs.readdir(path.join(src, folder))) if (file.endsWith('.ts') && !file.startsWith('register')) files.push(folder + '/' + file);
 for (const file of ['components/teams/TeamOrganizerField.tsx', 'components/teams/OrganizerBadge.tsx', 'components/teams/TeamMemberList.tsx', 'components/teams/TeamMemberRow.tsx', 'components/teams/TeamListItem.tsx', 'components/team/TeamMemberRow.tsx', 'components/agents/AgentStatus.tsx', 'components/avatars/AgentAvatar.tsx', 'components/shared/Icon.tsx', 'hooks/useAgentAvatar.ts', 'hooks/management-api.ts', 'hooks/useTeamEditor.ts']) files.push('renderer/' + file);
 for (const file of files) {
  const dest = path.join(base, file.replace(/\.tsx?$/, '.js'));
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, ts.transpileModule(await fs.readFile(path.join(src, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText);
 }
 const load = file => require(path.join(base, file + '.js'));
 const { JsonTeamRepository } = load('main/management/JsonTeamRepository');
 const { TeamService } = load('main/management/TeamService');
 const { ManagementError } = load('main/management/ManagementError');
 const { defaultTeams, defaultAgents } = load('main/management/defaults');
 const { TeamOrganizerField } = load('renderer/components/teams/TeamOrganizerField');
 const { TeamMemberList } = load('renderer/components/teams/TeamMemberList');
 const { TeamMemberRow } = load('renderer/components/team/TeamMemberRow');
 const { TeamListItem } = load('renderer/components/teams/TeamListItem');
 const agents = defaultAgents();
 const input = { name: 'Team', description: '', agentIds: ['lead', 'developer'], organizerAgentId: 'lead' };
 const validation = error => error instanceof ManagementError && error.code === 'VALIDATION';
 const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
 async function fixture(t, legacy) {
  const dir = await fs.mkdtemp(path.join(base, 'case-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'teams.json');
  if (legacy !== undefined) await fs.writeFile(file, JSON.stringify(legacy));
  const repo = new JsonTeamRepository(file);
  const service = new TeamService(repo, { getAgents: async () => agents });
  return { repo, service, file };
 }
 await t.test('minimum two different members, explicit Organizer, membership and uniqueness are mandatory', async t => {
  const { service } = await fixture(t);
  for (const change of [{ agentIds: [] }, { agentIds: ['lead'] }, { organizerAgentId: null }, { organizerAgentId: undefined }, { organizerAgentId: 'tester' }, { agentIds: ['lead', 'lead'] }]) await assert.rejects(service.createTeam({ ...input, ...change }), validation);
 });
 await t.test('Organizer cannot be removed without choosing a replacement', async t => {
  const { service } = await fixture(t);
  const team = await service.createTeam({ ...input, agentIds: ['lead', 'developer', 'tester'] });
  await assert.rejects(service.updateTeam(team.id, { ...input, agentIds: ['developer', 'tester'] }), validation);
  const changed = await service.updateTeam(team.id, { ...input, agentIds: ['developer', 'tester'], organizerAgentId: 'developer' });
  assert.equal(changed.organizerAgentId, 'developer');
  const changes = [];
  const list = TeamMemberList({ ids: input.agentIds, agents, organizerAgentId: 'lead', onChange: ids => changes.push(ids) });
  list.props.children[2].props.children[0].props.onRemove();
  assert.deepEqual(changes, []);
  const changedList = TeamMemberList({ ids: input.agentIds, agents, organizerAgentId: 'developer', onChange: ids => changes.push(ids) });
  changedList.props.children[2].props.children[0].props.onRemove();
  assert.deepEqual(changes, [['developer']]);
 });
 await t.test('Organizer is per-team and disabled assignments survive round trips', async t => {
  const { service, file } = await fixture(t);
  const first = await service.createTeam(input);
  const second = await service.createTeam({ ...input, organizerAgentId: 'developer' });
  agents[0].enabled = false;
  try {
   const reopened = new TeamService(new JsonTeamRepository(file), { getAgents: async () => agents });
   assert.equal((await reopened.getTeam(first.id)).organizerAgentId, 'lead');
   assert.equal((await reopened.getTeam(second.id)).organizerAgentId, 'developer');
   assert.equal((await reopened.updateTeam(first.id, input)).organizerAgentId, 'lead');
   assert.match(render(TeamOrganizerField, { members: agents.slice(0, 2), organizerAgentId: 'lead', onChange() {} }), /The selected Organizer is disabled/);
  } finally { agents[0].enabled = true; }
 });
 await t.test('legacy Core Team migrates first member atomically and idempotently', async t => {
  const legacy = defaultTeams().map(({ organizerAgentId, ...team }) => team);
  const { repo, file } = await fixture(t, legacy);
  const teams = await repo.list();
  assert.equal(teams[0].organizerAgentId, 'lead');
  assert.equal(teams[0].updatedAt, legacy[0].updatedAt);
  const once = await fs.readFile(file, 'utf8');
  assert.equal(JSON.parse(once).schemaVersion, 1);
  assert.deepEqual(await new JsonTeamRepository(file).list(), teams);
  assert.equal(await fs.readFile(file, 'utf8'), once);
  assert.deepEqual(await fs.readdir(path.dirname(file)), ['teams.json']);
 });
 await t.test('zero/single-member legacy records are retained but cannot be resaved until repaired', async t => {
  const legacy = [[], ['lead']].map((agentIds, i) => ({ ...defaultTeams()[0], id: 'legacy-' + i, agentIds }));
  for (const row of legacy) delete row.organizerAgentId;
  const { service, file } = await fixture(t, legacy);
  const rows = await service.getTeams();
  assert.equal(rows.length, 2);
  for (const row of rows) {
   assert.equal(row.organizerAgentId, null);
   await assert.rejects(service.updateTeam(row.id, { ...input, agentIds: row.agentIds }), validation);
  }
  assert.equal((await new JsonTeamRepository(file).list()).length, 2);
  await service.updateTeam(rows[0].id, input);
  assert.equal((await service.getTeam(rows[0].id)).organizerAgentId, 'lead');
 });
 await t.test('invalid schemas and malformed records are preserved with typed errors', async t => {
  for (const data of [{ schemaVersion: 99, teams: [] }, { schemaVersion: 1, teams: [{ ...defaultTeams()[0], organizerAgentId: 'outsider' }] }]) {
   const { repo, file } = await fixture(t, data);
   const before = await fs.readFile(file, 'utf8');
   await assert.rejects(repo.list(), error => error instanceof ManagementError);
   assert.equal(await fs.readFile(file, 'utf8'), before);
  }
 });
 await t.test('failed migration rename preserves original legacy file and leaves no temporary file', async t => {
  const legacy = defaultTeams().map(({ organizerAgentId, ...team }) => team);
  const { repo, file } = await fixture(t, legacy);
  const before = await fs.readFile(file, 'utf8');
  const rename = fs.rename;
  fs.rename = async () => { throw new Error('fixture write failure'); };
  try { await assert.rejects(repo.list(), error => error.code === 'WRITE_FAILED'); }
  finally { fs.rename = rename; }
  assert.equal(await fs.readFile(file, 'utf8'), before);
  assert.deepEqual(await fs.readdir(path.dirname(file)), ['teams.json']);
 });
 await t.test('Organizer selection contains only members and selected value saves and reloads', async t => {
  const { service, file } = await fixture(t);
  const team = await service.createTeam(input);
  let chosen = null;
  const field = TeamOrganizerField({ members: agents.slice(0, 2), organizerAgentId: 'lead', onChange: id => { chosen = id; } });
  field.props.children[0].props.children[1].props.onChange({ target: { value: 'developer' } });
  await service.updateTeam(team.id, { ...input, organizerAgentId: chosen });
  assert.equal((await new JsonTeamRepository(file).list()).find(row => row.id === team.id).organizerAgentId, 'developer');
  const html = render(TeamOrganizerField, { members: agents.slice(0, 2), organizerAgentId: chosen, onChange() {} });
  assert.match(html, /value="developer" selected/);
  assert.doesNotMatch(html, /Reviewer|Tester/);
 });
 await t.test('workspace row and list show Organizer without renaming agents or changing Working', () => {
  const html = render(TeamMemberRow, { member: agents[0], working: true, organizer: true });
  assert.match(html, /Lead/); assert.match(html, /organizer-badge/); assert.match(html, /Working/);
  assert.doesNotMatch(render(TeamMemberRow, { member: agents[1] }), /organizer-badge/);
  assert.match(render(TeamListItem, { team: defaultTeams()[0], organizerName: 'Lead', onSelect() {} }), /Organizer: Lead/);
 });
 await t.test('new draft has no implicit Organizer; edit draft carries and saves its selection', async () => {
  const code = await fs.readFile(path.join(base, 'renderer/hooks/useTeamEditor.js'), 'utf8');
  const exported = {}; const saves = [];
  new Function('require', 'exports', code)(id => id.includes('ManagementContext') ? { useTeamManagement: () => ({ save: (id, draft) => saves.push({ id, draft }) }) } : { useEditorDraft: (initial, save) => ({ initial, save }) }, exported);
  assert.equal(exported.useTeamEditor().initial.organizerAgentId, null);
  const editor = exported.useTeamEditor(defaultTeams()[0]);
  assert.equal(editor.initial.organizerAgentId, 'lead');
  editor.save({ ...editor.initial, organizerAgentId: 'developer' });
  assert.equal(saves[0].draft.organizerAgentId, 'developer');
 });
});
