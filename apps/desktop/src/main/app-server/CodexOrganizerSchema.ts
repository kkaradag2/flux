import type { OrganizerDecision, OrganizerPlanTask } from '../../application/orchestration/organizer/OrganizerDecision';
import { matchesOrganizerDecisionSchema } from '../../application/orchestration/organizer/organizerDecisionSchema';
import { AgentRuntimeError } from '../../application/runtime/AgentRuntimeError';
import type { AppServerJsonValue } from './contracts';

export type CodexOrganizerEnvelope = Readonly<{
 type: OrganizerDecision['type']; message: string; questions: readonly string[]; planSummary: string; tasks: readonly OrganizerPlanTask[];
}>;

const text = { type: 'string' } as const;
const strings = { type: 'array', items: text } as const;
const taskProperties = { key: text, title: text, description: text, ownerAgentId: text, dependsOn: strings, acceptanceCriteria: strings } as const;
const properties = { type: { type: 'string', enum: ['respond', 'ask_user', 'create_plan'] }, message: text, questions: strings, planSummary: text,
 tasks: { type: 'array', items: { type: 'object', properties: taskProperties, required: Object.keys(taskProperties), additionalProperties: false } },
} as const satisfies Record<keyof CodexOrganizerEnvelope, AppServerJsonValue>;
function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
export const codexOrganizerWireSchema = freeze({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false } satisfies AppServerJsonValue);
export const codexOrganizerWireInstructions = `Wire encoding: Return the runtime schema's complete flat object. Every field is required.
For respond: questions=[], tasks=[], planSummary="".
For ask_user: questions contains 1–3 questions, tasks=[], planSummary="".
For create_plan: questions=[], planSummary is nonempty, tasks contains the plan.
Never include fields outside this envelope. This wire encoding preserves the three decision meanings.`;

export function decodeCodexOrganizerEnvelope(text: string): OrganizerDecision {
 const fail = (): never => { throw new AgentRuntimeError('INVALID_STRUCTURED_RESULT'); };
 let value: unknown; try { value = JSON.parse(text); } catch { return fail(); }
 if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
 const data = value as Record<string, unknown>;
 if (Object.keys(data).length !== 5 || !Object.keys(properties).every(key => Object.hasOwn(data, key)) || typeof data.message !== 'string' || typeof data.planSummary !== 'string' || !Array.isArray(data.tasks) || !Array.isArray(data.questions)) return fail();
 let decision: unknown;
 if (data.type === 'respond' || data.type === 'ask_user') {
  if (data.planSummary !== '' || data.tasks.length || (data.type === 'respond' && data.questions.length)) return fail();
  decision = data.type === 'respond' ? { type: data.type, message: data.message } : { type: data.type, message: data.message, questions: data.questions };
 } else if (data.type === 'create_plan') {
  if (data.questions.length) return fail();
  decision = { type: data.type, message: data.message, planSummary: data.planSummary, tasks: data.tasks };
 } else return fail();
 if (!matchesOrganizerDecisionSchema(decision)) return fail();
 return decision;
}
