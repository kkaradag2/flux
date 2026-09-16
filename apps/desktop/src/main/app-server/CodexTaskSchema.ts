import type { AppServerJsonValue } from './contracts';
import { SmokeTestError } from './contracts';
export const codexTaskSchema: AppServerJsonValue = { type: 'object', additionalProperties: false, required: ['status','summary','evidence'], properties: {
  status: { type: 'string', enum: ['completed','needs_attention','blocked'] }, summary: { type: 'string' }, evidence: { type: 'array', items: { type: 'string' } } } };
export function decodeCodexTask(text: string): unknown { try { return JSON.parse(text); } catch { throw new SmokeTestError('PROTOCOL_ERROR'); } }
