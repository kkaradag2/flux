import type { AgentDefinition } from '../../shared/management-api';
export interface AgentRepository { list(): Promise<AgentDefinition[]>; save(agent: AgentDefinition, create: boolean): Promise<AgentDefinition>; }
