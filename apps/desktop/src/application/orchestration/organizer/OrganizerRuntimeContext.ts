import type { AgentRuntimeType } from '../../../shared/agent-runtime';
import { OrganizerDecisionError } from './OrganizerDecisionError';

export type OrganizerRuntimeContext = Readonly<{
  teamId: string;
  teamName: string;
  organizerAgentId: string;
  organizerAgentName: string;
  userRequest: string;
  conversationId: string;
  projectId: string;
  projectName: string;
  branch: string;
  members: readonly Readonly<{ id: string; name: string; description: string; runtime: AgentRuntimeType; enabled: boolean }>[];
}>;

export function createOrganizerRuntimeContext(team: { id: string; name: string; organizerAgentId: string | null; agentIds: readonly string[] }, agents: readonly { id: string; name: string; description: string; runtime: { type: AgentRuntimeType }; enabled: boolean }[], request: Pick<OrganizerRuntimeContext, 'userRequest' | 'conversationId' | 'projectId' | 'projectName' | 'branch'>): OrganizerRuntimeContext {
  const organizer = agents.find(agent => agent.id === team.organizerAgentId);
  if (!organizer || !team.agentIds.includes(organizer.id) || new Set(team.agentIds).size !== team.agentIds.length) throw new OrganizerDecisionError('INVALID_CONTEXT');
  const members = team.agentIds.map(id => {
    const agent = agents.find(item => item.id === id);
    if (!agent) throw new OrganizerDecisionError('INVALID_CONTEXT');
    return Object.freeze({ id: agent.id, name: agent.name, description: agent.description, runtime: agent.runtime.type, enabled: agent.enabled });
  });
  return Object.freeze({ teamId: team.id, teamName: team.name, organizerAgentId: organizer.id, organizerAgentName: organizer.name,
    userRequest: request.userRequest, conversationId: request.conversationId, projectId: request.projectId, projectName: request.projectName, branch: request.branch, members: Object.freeze(members) });
}

// Explicit projection also protects callers passing structurally compatible objects with extra fields.
export function projectOrganizerContext(context: OrganizerRuntimeContext): OrganizerRuntimeContext {
  return { teamId: context.teamId, teamName: context.teamName, organizerAgentId: context.organizerAgentId, organizerAgentName: context.organizerAgentName,
    userRequest: context.userRequest, conversationId: context.conversationId, projectId: context.projectId, projectName: context.projectName, branch: context.branch,
    members: context.members.map(member => ({ id: member.id, name: member.name, description: member.description, runtime: member.runtime, enabled: member.enabled })) };
}
