import type { ApiResult } from './project-api';
import type { ChatAgent, RunIdentity } from './single-agent-api';
export type ConversationStatus = 'running' | 'completed' | 'failed' | 'cancelled';
export type ConversationMessage = {
  id: string; role: 'user' | 'agent' | 'system'; content: string; agentId: string | null;
  planRunId?: string;
  superseded?: boolean;
  agentSnapshot?: ChatAgent;
  createdAt: string; status: 'streaming' | 'completed' | 'failed' | 'cancelled';
};
export type ConversationSummary = {
  mode?: 'single-agent' | 'team';
  id: string; projectId: string; branchName: string; teamId: string; leadAgentId: string;
  title: string; status: ConversationStatus; interrupted: boolean; createdAt: string; updatedAt: string;
};
// Codex thread IDs and agent instructions intentionally stay in the main record.
export type ConversationDetail = ConversationSummary & { agentSnapshot: ChatAgent; messages: ConversationMessage[] };
export type OpenConversationResult = { conversation: ConversationDetail; activeRun: RunIdentity | null };
export interface ConversationApi {
  getConversations(): Promise<ApiResult<ConversationSummary[]>>;
  openConversation(conversationId: string): Promise<ApiResult<OpenConversationResult>>;
}
