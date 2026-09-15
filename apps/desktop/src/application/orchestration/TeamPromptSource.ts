import type { AgentRuntimeType, RuntimeModelSettings } from '../../shared/agent-runtime';

/** Trusted application data port. Callers supply identifiers, never runtime settings or paths. */
export type PlanningProject = Readonly<{ id: string; name: string; path: string }>;
export type PlanningConversation = Readonly<{ id: string; projectId: string; branchName: string }>;
export type PlanningTeam = Readonly<{ id: string; name: string; organizerAgentId: string | null; agentIds: readonly string[] }>;
export type PlanningAgent = Readonly<{
  id: string; name: string; description: string; enabled: boolean; instructions: string;
  runtime: RuntimeModelSettings & Readonly<{ type: AgentRuntimeType }>;
}>;
export interface TeamPromptSource {
  getSelectedProjectId(): Promise<string | null>;
  getProject(id: string): Promise<PlanningProject | null>;
  getConversation(id: string): Promise<PlanningConversation | null>;
  getTeam(id: string): Promise<PlanningTeam | null>;
  getAgents(): Promise<readonly PlanningAgent[]>;
}
