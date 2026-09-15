import type { TeamPromptSource, PlanningAgent } from '../../application/orchestration/TeamPromptSource';
import type { ProjectService } from '../projects/ProjectService';
import type { ConversationStore } from '../chat/ConversationRepository';
import type { AgentService } from '../management/AgentService';
import type { TeamService } from '../management/TeamService';
import { ManagementError } from '../management/ManagementError';
import { OrchestrationBoundaryError as BoundaryError } from './OrchestrationBoundaryError';
import { orchestrationDirectory } from './OrchestrationStorageLocation';

export class MainTeamPromptSource implements TeamPromptSource {
  constructor(private projects: Pick<ProjectService, 'getProjects' | 'getSelectedProjectId' | 'getGitBranches'>,
    private conversations: Pick<ConversationStore, 'get'>, private teams: Pick<TeamService, 'getTeam'>, private agents: Pick<AgentService, 'getAgents'>,
    private userDataDirectory?: string) {}
  getSelectedProjectId() { return this.projects.getSelectedProjectId(); }
  async getProject(id: string) {
    const project = (await this.projects.getProjects()).find(project => project.id === id);
    if (!project) throw new BoundaryError('PROJECT_NOT_FOUND');
    // Recheck newly registered projects too; composition's initial exclusion list is not enough.
    if (this.userDataDirectory) await orchestrationDirectory({ userDataDirectory: this.userDataDirectory, excludedDirectories: [project.path] });
    try { await this.projects.getGitBranches(project.path); } catch { throw new BoundaryError('PROJECT_NOT_FOUND'); }
    return project;
  }
  async getConversation(id: string) {
    let conversation;
    try { conversation = await this.conversations.get(id); } catch { throw new BoundaryError('CONVERSATION_NOT_FOUND'); }
    return { id: conversation.id, projectId: conversation.projectId, branchName: conversation.branchName };
  }
  async getTeam(id: string) {
    try { return await this.teams.getTeam(id); }
    catch (error) { throw new BoundaryError(error instanceof ManagementError && error.code === 'NOT_FOUND' ? 'TEAM_NOT_FOUND' : 'TEAM_NOT_RUNNABLE'); }
  }
  async getAgents(): Promise<readonly PlanningAgent[]> {
    return (await this.agents.getAgents()).map(agent => ({ id: agent.id, name: agent.name, description: agent.description,
      enabled: agent.enabled, instructions: agent.instructionsMarkdown, runtime: { ...agent.runtime } }));
  }
  async validate(conversationId: string, projectId?: string, branch?: string): Promise<void> {
    const conversation = await this.getConversation(conversationId);
    if (projectId && conversation.projectId !== projectId) throw new BoundaryError('CONVERSATION_PROJECT_MISMATCH');
    const project = await this.getProject(conversation.projectId);
    const branches = await this.projects.getGitBranches(project.path);
    if (!branches.includes(conversation.branchName) || (branch !== undefined && (branch !== conversation.branchName || branch !== project.selectedBranch)))
      throw new BoundaryError('BRANCH_NOT_FOUND');
  }
  async validateTeam(id: string): Promise<void> {
    const team = await this.getTeam(id), agents = await this.getAgents();
    if (team.agentIds.length < 2 || new Set(team.agentIds).size !== team.agentIds.length || team.agentIds.some(id => !agents.some(a => a.id === id))) throw new BoundaryError('TEAM_NOT_RUNNABLE');
    if (!team.organizerAgentId || !team.agentIds.includes(team.organizerAgentId) || !agents.find(a => a.id === team.organizerAgentId)?.enabled) throw new BoundaryError('ORGANIZER_NOT_AVAILABLE');
  }
}
