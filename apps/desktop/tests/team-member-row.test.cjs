const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

test('TeamMemberRow working and idle presentation', async t => {
  const root = path.resolve(__dirname, '../../..');
  const output = path.join(root, '.cache/team-member-row-tests', String(Date.now()));
  for (const file of ['components/teams/OrganizerBadge.tsx', 'components/team/TeamMemberRow.tsx', 'components/avatars/AgentAvatar.tsx', 'components/shared/Icon.tsx', 'hooks/useAgentAvatar.ts', 'hooks/management-api.ts']) {
    const destination = path.join(output, file.replace(/\.tsx?$/, '.js'));
    await fs.mkdir(path.dirname(destination), { recursive: true });
    const source = await fs.readFile(path.join(root, 'apps/desktop/src/renderer', file), 'utf8');
    await fs.writeFile(destination, ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText);
  }
  const { TeamMemberRow } = require(path.join(output, 'components/team/TeamMemberRow.js'));
  const member = { id: 'lead', name: 'Lead', avatar: { type: 'builtin', value: 'robot' }, enabled: true };
  const render = props => renderToStaticMarkup(React.createElement(TeamMemberRow, { member, ...props }));

  await t.test('working keeps a text label and styles both avatar and status with a decorative dot', () => {
    const html = render({ working: true });
    assert.match(html, /class="team-member team-member--working"/);
    assert.match(html, /class="team-status team-status--working"/);
    assert.match(html, /class="agent-avatar"/);
    assert.match(html, /class="team-status-dot" aria-hidden="true"/);
    assert.match(html, />Working</);
    assert.doesNotMatch(html, /runtime-update-spinner|>Idle</);
  });
  await t.test('completion or Stop returning working=false restores neutral Idle markup', () => {
    const idle = render({});
    assert.notEqual(render({ working: true }), idle);
    assert.equal(render({ working: false }), idle);
    assert.match(idle, />Idle</);
    assert.doesNotMatch(idle, /--working|spinner|Working/);
  });
  await t.test('disabled members retain their existing label and neutral appearance', () => {
    const html = render({ member: { ...member, enabled: false } });
    assert.match(html, />Disabled</);
    assert.doesNotMatch(html, /--working|spinner/);
  });
});
