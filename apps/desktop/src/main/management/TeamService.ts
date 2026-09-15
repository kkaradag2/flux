import { randomUUID } from 'node:crypto';
import type { TeamDefinition, TeamInput } from '../../shared/management-api';
import type { TeamRepository } from './TeamRepository';
import type { AgentService } from './AgentService';
import { teamInput } from './validation';
import { ManagementError } from './ManagementError';
export class TeamService {
 constructor(private repository: TeamRepository, private agents: AgentService) {}
 private async check(data: TeamInput): Promise<void> { const ids = new Set((await this.agents.getAgents()).map(agent => agent.id)); if (data.agentIds.some(id => !ids.has(id))) throw new ManagementError('UNKNOWN_AGENT', 'The team contains an agent that does not exist.'); }
 async getTeams(): Promise<TeamDefinition[]> { await this.agents.getAgents(); const teams = await this.repository.list(); for (const team of teams) await this.check(team); return teams; }
 async getTeam(id: unknown): Promise<TeamDefinition> { const team = (await this.getTeams()).find(item => item.id === id); if (!team) throw new ManagementError('NOT_FOUND', 'Team not found.'); return team; }
 async createTeam(input: unknown): Promise<TeamDefinition> { const data = teamInput(input); await this.check(data); const now = new Date().toISOString(); return this.repository.save({ ...data, id: randomUUID(), createdAt: now, updatedAt: now }, true); }
 async updateTeam(id: unknown, input: unknown): Promise<TeamDefinition> { const data = teamInput(input); await this.check(data); const existing = await this.getTeam(id); return this.repository.save({ ...data, id: existing.id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() }, false); }
}
