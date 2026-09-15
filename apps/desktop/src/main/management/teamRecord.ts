import type { TeamDefinition } from '../../shared/management-api';
import { ManagementError } from './ManagementError';
import { record, storedTeam } from './validation';

export type TeamFile = { schemaVersion: 1; teams: TeamDefinition[] };
export function parseTeamFile(value: unknown): { teams: TeamDefinition[]; migrated: boolean } {
  const legacy = Array.isArray(value);
  let rows: unknown[];
  if (legacy) rows = value;
  else {
    const data = record(value);
    if (data.schemaVersion !== 1) throw new ManagementError('UNSUPPORTED_SCHEMA', 'The saved team format is not supported. The original file has been preserved.');
    if (!Array.isArray(data.teams)) throw new ManagementError('VALIDATION', 'Invalid saved team list.');
    rows = data.teams;
  }
  const teams = rows.map(row => {
    const data = record(row);
    if (legacy && !Object.hasOwn(data, 'organizerAgentId')) {
      const ids = data.agentIds;
      return storedTeam({ ...data, organizerAgentId: Array.isArray(ids) && ids.length >= 2 ? ids[0] : null });
    }
    return storedTeam(data);
  });
  if (new Set(teams.map(team => team.id)).size !== teams.length) throw new ManagementError('VALIDATION', 'Duplicate team ID in saved data.');
  return { teams, migrated: legacy };
}
