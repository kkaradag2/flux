import type { ApiResult } from './project-api';
import type { AgentAvatar } from './management-api';
import type { ConversationDetail } from './conversation-api';

export type SingleAgentInput = { projectId: string; branch: string; teamId: string; prompt: string };
export type ChatAgent = { id: string; name: string; avatar: AgentAvatar };
export type RunIdentity = { conversationId: string; runId: string };
export type SingleAgentEvent = RunIdentity & { conversation?: ConversationDetail } & (
  | { type: 'started'; agent: ChatAgent }
  | { type: 'messageDelta'; itemId: string; text: string }
  | { type: 'completed'; text: string }
  | { type: 'failed'; code: string; message: string }
  | { type: 'cancelled' }
);
export interface SingleAgentApi {
  startSingleAgentTurn(input: SingleAgentInput): Promise<ApiResult<RunIdentity>>;
  cancelSingleAgentTurn(): Promise<ApiResult<void>>;
  resetSingleAgentConversation(): Promise<ApiResult<void>>;
  subscribeSingleAgentEvents(listener: (event: SingleAgentEvent) => void): () => void;
}
