import { validateTaskGraph } from '../../../domain/orchestration/taskGraph';
import type { AgentTask } from '../../../domain/orchestration/models';
import { OrchestrationError } from '../../../domain/orchestration/OrchestrationError';
import type { OrganizerDecision } from './OrganizerDecision';
import type { OrganizerRuntimeContext } from './OrganizerRuntimeContext';
import { OrganizerDecisionError } from './OrganizerDecisionError';
import { matchesOrganizerDecisionSchema } from './organizerDecisionSchema';

export function validateOrganizerDecision(value: unknown, context: OrganizerRuntimeContext): OrganizerDecision {
  if (!matchesOrganizerDecisionSchema(value)) throw new OrganizerDecisionError('INVALID_SHAPE');
  if (value.type === 'create_plan') {
    const ids = new Set(context.members.map(member => member.id));
    if (ids.size !== context.members.length || !ids.has(context.organizerAgentId)) throw new OrganizerDecisionError('INVALID_CONTEXT');
    for (const task of value.tasks) if (!context.members.some(member => member.id === task.assigneeAgentId && member.enabled)) throw new OrganizerDecisionError('INVALID_ASSIGNEE');
    // Transient graph projection only: no IDs are persisted and no transition is executed.
    const tasks: AgentTask[] = value.tasks.map(task => ({ id: task.key, runId: 'organizer-decision', title: task.title, description: task.description,
      assigneeAgentId: task.assigneeAgentId, delegatorAgentId: context.organizerAgentId, dependsOn: task.dependsOn, acceptanceCriteria: task.acceptanceCriteria,
      requiresReview: task.requiresReview, required: true, status: 'planned', createdAt: '', updatedAt: '', startedAt: null, completedAt: null }));
    try { validateTaskGraph('organizer-decision', tasks); }
    catch (error) { if (error instanceof OrchestrationError) throw new OrganizerDecisionError('INVALID_DEPENDENCIES'); throw error; }
  }
  const result: OrganizerDecision = structuredClone(value);
  if (result.type === 'ask_user') Object.freeze(result.questions);
  if (result.type === 'create_plan') { result.tasks.forEach(task => { Object.freeze(task.dependsOn); Object.freeze(task.acceptanceCriteria); Object.freeze(task); }); Object.freeze(result.tasks); }
  return Object.freeze(result);
}

export function parseOrganizerDecision(output: string, context: OrganizerRuntimeContext): OrganizerDecision {
  let value: unknown;
  try { value = JSON.parse(output); } catch { throw new OrganizerDecisionError('INVALID_JSON'); }
  return validateOrganizerDecision(value, context);
}
