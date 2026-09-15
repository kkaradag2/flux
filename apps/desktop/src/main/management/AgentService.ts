import { randomUUID } from 'node:crypto';
import type { AgentDefinition } from '../../shared/management-api';
import type { AgentRepository } from './AgentRepository';
import type { AgentAssetService } from './AgentAssetService';
import { agentInput } from './validation';
import { ManagementError } from './ManagementError';
export class AgentService {
 constructor(private repository: AgentRepository, private assets: AgentAssetService) {}
 getAgents(): Promise<AgentDefinition[]> { return this.repository.list(); }
 async getAgent(id: unknown): Promise<AgentDefinition> { const agent = (await this.getAgents()).find(item => item.id === id); if (!agent) throw new ManagementError('NOT_FOUND', 'Agent not found.'); return agent; }
 async createAgent(input: unknown): Promise<AgentDefinition> {
  const data = agentInput(input); if (data.avatar.type === 'image') await this.assets.getDataUrl(data.avatar.assetId);
  const now = new Date().toISOString(); return this.repository.save({ ...data, id: randomUUID(), createdAt: now, updatedAt: now }, true);
 }
 async updateAgent(id: unknown, input: unknown): Promise<AgentDefinition> {
  const data = agentInput(input); const existing = await this.getAgent(id); if (data.avatar.type === 'image') await this.assets.getDataUrl(data.avatar.assetId);
  return this.repository.save({ ...data, id: existing.id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() }, false);
 }
}
