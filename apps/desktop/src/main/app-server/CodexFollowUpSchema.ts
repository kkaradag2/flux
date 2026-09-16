import { validateFollowUpDecision } from '../../application/orchestration/organizer/FollowUpDecision';
import { AgentRuntimeError } from '../../application/runtime/AgentRuntimeError';
const properties = {
  type: { type: 'string', enum: ['continue_task', 'accept_result', 'ask_user'] },
  taskId: { type: 'string' }, message: { type: 'string' }, guidance: { type: 'string' },
  questions: { type: 'array', items: { type: 'string' } },
};
export const codexFollowUpSchema = { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
export const codexFollowUpInstructions = 'Return every envelope field. For continue_task use questions=[]. For accept_result use guidance="" and questions=[]. For ask_user use guidance="". Never add fields.';
export function decodeCodexFollowUp(text: string) {
  try {
    const data = JSON.parse(text) as Record<string, unknown>;
    if (!data || Object.keys(data).length !== 5 || !Object.keys(properties).every(key => Object.hasOwn(data, key)) || typeof data.taskId !== 'string'
      || typeof data.guidance !== 'string' || !Array.isArray(data.questions)) throw new Error();
    const { guidance, questions, ...base } = data;
    if (data.type !== 'continue_task' && guidance !== '' || data.type !== 'ask_user' && questions.length) throw new Error();
    return validateFollowUpDecision(data.type === 'continue_task' ? { ...base, guidance } : data.type === 'ask_user' ? { ...base, questions } : base, data.taskId, true);
  } catch { throw new AgentRuntimeError('INVALID_STRUCTURED_RESULT'); }
}
