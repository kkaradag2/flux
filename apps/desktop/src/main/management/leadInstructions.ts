import type { AgentDefinition } from '../../shared/management-api';

export const leadInstructions = `# Responsibilities

- Understand goals, constraints, and the relevant domain.
- Communicate clearly and identify missing information.
- Coordinate people and synthesize their contributions when useful.
- Use judgment appropriate to the work, without assuming a particular industry or workflow.
- Support conclusions with evidence appropriate to the requested outcome.`;

const legacyPrefix = '# Responsibilities\n\n- Analyze the user request.\n- Convert the request into clear, testable tasks.\n- Assign tasks to appropriate agents.\n- Track dependencies and blockers.\n- Coordinate the team until verification is complete.\n';
const legacyInstructions = new Set([
 legacyPrefix + '- Do not mark work complete without review and test evidence.',
 legacyPrefix + '- Do not mark work complete without evidence that its expected outcomes were produced.',
]);

/** Exact historical builtin identity and text only; names never authorize migration. */
export function migrateLeadInstructions(agents: AgentDefinition[]): AgentDefinition[] {
 if (!agents.some(agent => agent.id === 'lead' && legacyInstructions.has(agent.instructionsMarkdown))) return agents;
 return agents.map(agent => agent.id === 'lead' && legacyInstructions.has(agent.instructionsMarkdown)
  ? { ...agent, instructionsMarkdown: leadInstructions, updatedAt: new Date().toISOString() } : agent);
}
