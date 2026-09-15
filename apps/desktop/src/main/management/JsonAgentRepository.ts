import type { AgentDefinition } from '../../shared/management-api';
import type { AgentRepository } from './AgentRepository';
import { JsonStore } from './JsonStore';
import { storedAgent } from './validation';
import { defaultAgents } from './defaults';
import { ManagementError } from './ManagementError';
export class JsonAgentRepository implements AgentRepository {
 private store: JsonStore<AgentDefinition>;
 constructor(file: string) { this.store = new JsonStore(file, storedAgent, defaultAgents); }
 list(): Promise<AgentDefinition[]> { return this.store.list(); }
 save(value: AgentDefinition, create: boolean): Promise<AgentDefinition> {
  return this.store.transaction(items => {
   const index = items.findIndex(item => item.id === value.id);
   if (create ? index >= 0 : index < 0) throw new ManagementError('NOT_FOUND', 'Agent could not be saved. Refresh the list.');
   if (create) items.push(value); else items[index] = value;
   return { items, result: value };
  });
 }
}
