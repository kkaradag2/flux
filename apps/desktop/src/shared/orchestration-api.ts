import type { ConversationDetail } from './conversation-api';
export type OrchestrationRunStatus = 'planning' | 'running' | 'waiting_input' | 'completed' | 'failed' | 'cancelled';
export type OrchestrationTaskStatus = import('./task-status').TaskStatus;
export type ConversationOrchestrationView = {
  conversation?: ConversationDetail;
  execution?: { checking?: boolean; canStart: boolean; activeTaskId: string | null; hasExecuted: boolean; retry?: { attempt: number; message: string } | null };
  run: { canContinue?: boolean; id: string; status: OrchestrationRunStatus; goal: string; organizerAgentId: string; organizerName: string; createdAt: string; updatedAt: string } | null;
  plan: { id: string; version: number; summary: string } | null;
  tasks: Array<{ id: string; title: string; status: OrchestrationTaskStatus; assignee: { id: string; name: string; avatar?: string }; dependsOn: string[]; dependencySummary?: string }>;
};
export type StartTeamPromptRequest = { conversationId: string; projectId: string; branch: string; teamId: string; message: string };
export type ContinueTeamPromptRequest = { runId: string; message: string };
export type OrchestrationChange = { conversationId: string; view: ConversationOrchestrationView };
export type TeamPromptResponse = { type: 'respond' | 'ask_user' | 'plan_created'; runId: string; message: string; questions?: string[]; view: ConversationOrchestrationView };
export type OrchestrationErrorCode = 'PROJECT_NOT_FOUND' | 'CONVERSATION_NOT_FOUND' | 'CONVERSATION_PROJECT_MISMATCH' | 'BRANCH_NOT_FOUND' | 'TEAM_NOT_FOUND' | 'TEAM_NOT_RUNNABLE' | 'ORGANIZER_NOT_AVAILABLE' | 'RUNTIME_NOT_READY' | 'RUN_NOT_FOUND' | 'RUN_NOT_WAITING_INPUT' | 'ORCHESTRATION_BUSY' | 'ORCHESTRATION_FAILED' | 'EXECUTION_FAILED' | 'NO_READY_TASK' | 'OWNER_UNAVAILABLE' | 'EXECUTION_BUSY' | 'EXECUTION_INTERRUPTED' | 'UNSAFE_WORKTREE' | 'WORKTREE_PREPARATION_FAILED' | 'RETRY_NOT_ALLOWED' | 'RETRY_RUNTIME_CHANGED' | 'RETRY_DIRTY_WORKTREE' | 'RETRY_PREFLIGHT_FAILED';
export type OrchestrationResponse<T> = { ok: true; value: T } | { ok: false; error: { code: OrchestrationErrorCode; message: string } };
export interface OrchestrationApi {
  retryTaskExecution(input: { runId: string }): Promise<OrchestrationResponse<ConversationOrchestrationView>>;
  startNextTaskExecution(input: { runId: string }): Promise<OrchestrationResponse<ConversationOrchestrationView>>;
  cancelTaskExecution(input: { runId: string }): Promise<OrchestrationResponse<void>>;
  createTeamConversation(input: { projectId: string; branch: string; teamId: string }): Promise<OrchestrationResponse<ConversationDetail>>;
  cancelTeamPrompt(input: { runId: string }): Promise<OrchestrationResponse<void>>;
  getConversationOrchestration(conversationId: string): Promise<OrchestrationResponse<ConversationOrchestrationView>>;
  startTeamPrompt(request: StartTeamPromptRequest): Promise<OrchestrationResponse<TeamPromptResponse>>;
  continueTeamPrompt(request: ContinueTeamPromptRequest): Promise<OrchestrationResponse<TeamPromptResponse>>;
  subscribeToOrchestrationChanges(listener: (change: OrchestrationChange) => void): () => void;
}
