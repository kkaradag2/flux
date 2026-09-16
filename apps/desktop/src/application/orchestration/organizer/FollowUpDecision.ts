import { safeExecutionText } from '../execution/AgentTaskExecutor';

export type FollowUpDecision =
  | Readonly<{ type: 'continue_task'; taskId: string; guidance: string; message: string }>
  | Readonly<{ type: 'accept_result'; taskId: string; message: string }>
  | Readonly<{ type: 'ask_user'; taskId: string; questions: readonly string[]; message: string }>;

export function validateFollowUpDecision(value: unknown, taskId: string, hasSession: boolean): FollowUpDecision {
  const fail = (): never => { throw new Error('INVALID_FOLLOW_UP'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const data = value as Record<string, unknown>;
  const clean = (value: unknown, max: number): string => {
    if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x08]/.test(value)) return fail();
    return safeExecutionText(value).replace(/(?<![\w])(?:\/[^\s"<>]+|\\\\[^\s]+)/g, '[local path]');
  };
  const keys = data.type === 'continue_task' ? ['type', 'taskId', 'message', 'guidance'] : data.type === 'ask_user' ? ['type', 'taskId', 'message', 'questions'] : ['type', 'taskId', 'message'];
  if (Object.keys(data).length !== keys.length || Object.keys(data).some(key => !keys.includes(key)) || data.taskId !== taskId) return fail();
  const message = clean(data.message, 2000);
  if (data.type === 'accept_result') return { type: data.type, taskId, message };
  if (data.type === 'continue_task' && hasSession) return { type: data.type, taskId, message, guidance: clean(data.guidance, 4000) };
  if (data.type === 'ask_user' && Array.isArray(data.questions) && data.questions.length >= 1 && data.questions.length <= 3)
    return { type: data.type, taskId, message, questions: data.questions.map(value => clean(value, 500)) };
  return fail();
}
