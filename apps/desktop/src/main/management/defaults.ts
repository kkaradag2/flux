import type { AgentDefinition, TeamDefinition } from '../../shared/management-api';
export function defaultAgents(): AgentDefinition[] {
 const now = new Date().toISOString();
 const rows = [
 { id: 'lead', name: 'Lead', description: 'Plans the request and coordinates the team.', icon: 'robot', lines: ['Analyze the user request.', 'Convert the request into clear, testable tasks.', 'Assign tasks to appropriate agents.', 'Track dependencies and blockers.', 'Coordinate the team until verification is complete.', 'Do not mark work complete without review and test evidence.'] },
 { id: 'developer', name: 'Developer', description: 'Implements the requested code changes.', icon: 'code', lines: ['Implement only the assigned change.', "Follow the selected project's instructions and architecture.", 'Keep changes focused and maintainable.', 'Do not modify unrelated files.', 'Report changed files and verification results.'] },
 { id: 'reviewer', name: 'Reviewer', description: 'Reviews the implementation and reports PASS or FAIL.', icon: 'search', lines: ['Review only the requested change.', 'Check acceptance criteria and project quality rules.', 'Return **PASS** when all requirements are satisfied.', 'Return **FAIL** with concrete corrections when problems exist.', 'Do not implement changes during review.'] },
 { id: 'tester', name: 'Tester', description: 'Verifies acceptance criteria and test results.', icon: 'test-tube', lines: ['Verify each acceptance criterion.', 'Run appropriate automated and manual tests.', 'Report **PASS** or **FAIL** with evidence.', 'Clearly identify environmental blockers.', 'Do not report unverified work as complete.'] },
 ] as const;
 return rows.map(row => ({ id: row.id, name: row.name, description: row.description, avatar: { type: 'builtin', value: row.icon }, runtime: { type: 'codex', model: null, reasoningEffort: 'default' }, instructionsMarkdown: '# Responsibilities\n\n' + row.lines.map(line => '- ' + line).join('\n'), enabled: true, createdAt: now, updatedAt: now }));
}
export function defaultTeams(): TeamDefinition[] { const now = new Date().toISOString(); return [{ id: 'core-team', name: 'Core Team', description: 'Default software development team.', agentIds: ['lead', 'developer', 'reviewer', 'tester'], createdAt: now, updatedAt: now }]; }
