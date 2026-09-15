import type { TeamDefinition } from '../../shared/management-api';
import type { TeamRepository } from './TeamRepository';
import { JsonStore } from './JsonStore';
import { storedTeam } from './validation';
import { defaultTeams } from './defaults';
import { ManagementError } from './ManagementError';
export class JsonTeamRepository implements TeamRepository {
 private store: JsonStore<TeamDefinition>;
 constructor(file: string) { this.store = new JsonStore(file, storedTeam, defaultTeams); }
 list(): Promise<TeamDefinition[]> { return this.store.list(); }
 save(value: TeamDefinition, create: boolean): Promise<TeamDefinition> {
  return this.store.transaction(items => {
   const index = items.findIndex(item => item.id === value.id);
   if (create ? index >= 0 : index < 0) throw new ManagementError('NOT_FOUND', 'Team could not be saved. Refresh the list.');
   if (create) items.push(value); else items[index] = value;
   return { items, result: value };
  });
 }
}
