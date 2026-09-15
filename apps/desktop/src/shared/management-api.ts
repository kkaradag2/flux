import type { ApiResult } from './project-api';
export const builtinAgentIcons = ['robot', 'terminal', 'code', 'search', 'shield', 'test-tube', 'git-branch', 'database'] as const;
export type BuiltinAgentIcon = typeof builtinAgentIcons[number];
export type AgentAvatar = { type: 'builtin'; value: BuiltinAgentIcon } | { type: 'image'; assetId: string };
export type AgentRuntime = { type: 'codex'; model: string | null; reasoningEffort: 'default' | 'low' | 'medium' | 'high' };
export type AgentDefinition = { id: string; name: string; description: string; avatar: AgentAvatar; runtime: AgentRuntime; instructionsMarkdown: string; enabled: boolean; createdAt: string; updatedAt: string };
// null is retained only for legacy teams that need configuration before saving.
export type TeamDefinition = { id: string; name: string; description: string; agentIds: string[]; organizerAgentId: string | null; createdAt: string; updatedAt: string };
export type AgentInput = Omit<AgentDefinition, 'id' | 'createdAt' | 'updatedAt'>;
export type TeamInput = Omit<TeamDefinition, 'id' | 'createdAt' | 'updatedAt'>;
export interface ManagementApi {
 getAgents(): Promise<ApiResult<AgentDefinition[]>>;
 getAgent(id: string): Promise<ApiResult<AgentDefinition>>;
 createAgent(input: AgentInput): Promise<ApiResult<AgentDefinition>>;
 updateAgent(id: string, input: AgentInput): Promise<ApiResult<AgentDefinition>>;
 selectAgentAvatarImage(): Promise<ApiResult<string | null>>;
 getAgentAvatarDataUrl(assetId: string): Promise<ApiResult<string>>;
 getTeams(): Promise<ApiResult<TeamDefinition[]>>;
 getTeam(id: string): Promise<ApiResult<TeamDefinition>>;
 createTeam(input: TeamInput): Promise<ApiResult<TeamDefinition>>;
 updateTeam(id: string, input: TeamInput): Promise<ApiResult<TeamDefinition>>;
}
