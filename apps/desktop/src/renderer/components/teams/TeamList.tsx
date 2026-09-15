import type { TeamDefinition } from '../../../shared/management-api';
import { TeamListItem } from './TeamListItem';
export function TeamList({ teams, onSelect }: { teams: readonly TeamDefinition[]; onSelect: (id: string) => void }) { return <div className="management-table"><div className="table-heading team-columns" aria-hidden="true"><span>Team</span><span>Agents</span><span>Updated</span><span /></div><ul className="plain-list" aria-label="Teams">{teams.map(team => <TeamListItem key={team.id} team={team} onSelect={() => onSelect(team.id)} />)}</ul></div>; }
