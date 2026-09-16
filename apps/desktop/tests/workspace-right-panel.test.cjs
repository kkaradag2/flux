const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

test('Workspace Tasks / Team presentation', async t => {
  const root = path.resolve(__dirname, '../../..');
  const sourceRoot = path.join(root, 'apps/desktop/src/renderer');
  const base = path.join(root, '.cache/workspace-panel-tests');
  await fs.mkdir(base, { recursive: true });
  const output = await fs.mkdtemp(path.join(base, 'run-'));
  t.after(() => fs.rm(output, { recursive: true, force: true }));
  const files = ['components/teams/OrganizerBadge.tsx', 'hooks/useWorkspacePanel.ts', 'components/shared/Icon.tsx',
    ...['WorkspaceRightPanel', 'PanelTabs'].map(name => 'components/panel/' + name + '.tsx'),
    'components/tasks/workspaceTask.ts',
    ...['TasksPanel', 'TaskList', 'TaskRow', 'TaskProgressSummary', 'TaskStatusIndicator'].map(name => 'components/tasks/' + name + '.tsx'),
    'components/team/TeamPanel.tsx', 'components/team/TeamMemberRow.tsx', 'components/avatars/AgentAvatar.tsx', 'hooks/useAgentAvatar.ts', 'hooks/management-api.ts'];
  for (const file of files) {
    const destination = path.join(output, file.replace(/\.tsx?$/, '.js'));
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, ts.transpileModule(await fs.readFile(path.join(sourceRoot, file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText);
  }
  const load = file => require(path.join(output, file + '.js'));
  const { WorkspaceRightPanel } = load('components/panel/WorkspaceRightPanel');
  const { PanelTabs } = load('components/panel/PanelTabs');
  const { TasksPanel } = load('components/tasks/TasksPanel');
  const { TaskRow } = load('components/tasks/TaskRow');
  const { TaskList } = load('components/tasks/TaskList');
  const { TaskProgressSummary } = load('components/tasks/TaskProgressSummary');
  const { taskStatusLabels } = load('components/tasks/workspaceTask');
  const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
  const task = (id, status = 'planned', extra = {}) => ({ id, title: 'Task ' + id, status, assignee: { id: 'lead', name: 'Lead' }, ...extra });

  // A hook-only state harness: dependency injection avoids adding a DOM/test renderer package.
  const hookCode = await fs.readFile(path.join(output, 'hooks/useWorkspacePanel.js'), 'utf8');
  function hookInstance() {
    let state, initialized = false;
    const exports = {};
    new Function('require', 'exports', hookCode)(() => ({ useState(initial) {
      if (!initialized) { state = initial; initialized = true; }
      return [state, next => { state = next; }];
    } }), exports);
    return exports.useWorkspacePanel;
  }
  await t.test('defaults to Team without tasks and Tasks with tasks', () => {
    assert.equal(hookInstance()(0).selectedTab, 'team');
    assert.equal(hookInstance()(4).selectedTab, 'tasks');
  });
  await t.test('explicit tab choice survives rerenders and changing task counts', () => {
    const hook = hookInstance();
    const first = hook(0);
    const tabs = PanelTabs({ selectedTab: first.selectedTab, onSelect: first.selectTab, id: 'test' });
    tabs.props.children[0].props.onClick();
    assert.equal(hook(0).selectedTab, 'tasks');
    hook(4).selectTab('team');
    assert.equal(hook(4).selectedTab, 'team');
    assert.equal(hook(0).selectedTab, 'team');
  });
  await t.test('selection is owned outside the conditional screen; panel uses accessible controlled tabs', async () => {
    const screen = await fs.readFile(path.join(sourceRoot, 'components/WorkspaceScreen.tsx'), 'utf8');
    assert.match(screen, /const panel = useWorkspacePanel\(workspaceTasks.length\)/);
    assert.match(screen, /workspace \? <WorkspaceRightPanel/);
    assert.match(screen, /selectedTab={panel.selectedTab}/);
    const html = render(WorkspaceRightPanel, { tasks: [], selectedTab: 'tasks', onSelectTab() {}, team: React.createElement('h2', null, 'Core Team') });
    assert.match(html, /role="tablist"/);
    assert.match(html, /aria-selected="true" tabindex="0">Tasks/);
    assert.match(html, /aria-selected="false" tabindex="-1">Team/);
    assert.match(html, /role="tabpanel"[^>]*hidden=""[^>]*><h2>Core Team/);
  });
  await t.test('TeamPanel still renders selected agents and existing Working / Idle states', async () => {
    // Stub only provider boundaries; TeamPanel, member rows and avatars are real components.
    await fs.mkdir(path.join(output, 'state'), { recursive: true });
    await fs.writeFile(path.join(output, 'state/ManagementContext.js'), `exports.useAgentManagement=()=>({agents:[{id:'lead',name:'Lead',enabled:true,avatar:{type:'builtin',value:'robot'}},{id:'dev',name:'Developer',enabled:true,avatar:{type:'builtin',value:'code'}}]});exports.useTeamManagement=()=>({teams:[{id:'core',name:'Core Team',agentIds:['lead','dev'],organizerAgentId:'lead'}],loading:false});`);
    await fs.writeFile(path.join(output, 'state/WorkspaceContext.js'), `exports.useWorkspace=()=>({selectedTeamId:'core',workingAgentId:'lead',running:true});`);
    const { TeamPanel } = load('components/team/TeamPanel');
    const html = render(WorkspaceRightPanel, { tasks: [], selectedTab: 'team', onSelectTab() {}, team: React.createElement(TeamPanel) });
    for (const text of ['Core Team', 'Lead', 'Developer', 'Working', 'Idle']) assert.ok(html.includes(text));
    assert.equal((html.match(/team-member--working/g) || []).length, 1);
    assert.equal((html.match(/organizer-badge/g) || []).length, 1);
    assert.match(html, /Lead <span class="organizer-badge">Organizer/);
  });
  await t.test('counts only completed tasks, without percentages', () => {
    const html = render(TaskProgressSummary, { tasks: [task('a', 'completed'), task('b', 'failed'), task('c', 'completed'), task('d', 'cancelled')] });
    assert.match(html, />2 of 4 done</);
    assert.doesNotMatch(html, /%/);
  });
  await t.test('all eight statuses have correct visible labels and matching icon classes', () => {
    assert.deepEqual(Object.values(taskStatusLabels), ['Planned', 'Ready', 'Working', 'Blocked', 'Needs attention', 'Completed', 'Failed', 'Cancelled']);
    for (const [status, label] of Object.entries(taskStatusLabels)) {
      const html = render(TaskRow, { task: task(status, status) });
      assert.ok(html.includes('>' + label + '</span>'));
      assert.ok(html.includes('task-status-icon--' + status));
    }
  });
  await t.test('given plan order remains unchanged when statuses change', () => {
    const tasks = [task('z', 'working'), task('a', 'completed'), task('m', 'ready')];
    for (const list of [tasks, tasks.map(item => ({ ...item, status: 'failed' }))]) {
      const html = render(TaskList, { tasks: list });
      assert.ok(html.indexOf('Task z') < html.indexOf('Task a'));
      assert.ok(html.indexOf('Task a') < html.indexOf('Task m'));
    }
  });
  await t.test('dependency is optional; owner name and avatar are rendered', () => {
    assert.doesNotMatch(render(TaskRow, { task: task('a') }), /task-dependency-summary/);
    const html = render(TaskRow, { task: task('a', 'blocked', { dependencySummary: 'Waiting for API design' }) });
    assert.match(html, /Waiting for API design/);
    assert.match(html, /workspace-task-avatar/);
    assert.match(html, />Lead</);
  });
  await t.test('empty panel has exact copy, no sample tasks or CTA', () => {
    const html = render(TasksPanel, { tasks: [] });
    assert.match(html, /No tasks yet/);
    assert.doesNotMatch(html, /0 of 0 done/);
    assert.match(html, /Tasks will appear here when the team starts working\./);
    assert.doesNotMatch(html, /<li|<button|<a\s/);
  });
  await t.test('rows are plain list items, not actions', () => {
    const html = render(TaskRow, { task: task('a') });
    assert.match(html, /^<li /);
    assert.doesNotMatch(html, /<button|<a\s|tabindex|role="(?:button|link)"/);
  });
  await t.test('only Working pulses and reduced motion disables both task and agent pulses', async () => {
    const css = await fs.readFile(path.join(sourceRoot, 'styles.css'), 'utf8');
    assert.match(css, /\.task-status-icon--working\s*{ animation: workspace-task-pulse/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*{\s*\.task-status-icon--working\s*{ animation: none;/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*{\s*\.team-status--working .team-status-dot\s*{ animation: none;/);
    assert.doesNotMatch(css, /\.task-status-icon--(?:completed|planned|ready|cancelled)\s*{[^}]*animation:/);
  });
});
