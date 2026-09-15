import type { AgentDefinition } from '../../../shared/management-api';
import { TeamMemberRow } from './TeamMemberRow';
export function TeamMemberList({ ids, agents, onChange }: { ids: string[]; agents: AgentDefinition[]; onChange: (ids: string[]) => void }) {
 const move = (index: number, direction: -1 | 1): void => { const next = [...ids]; const target = index + direction; const id = next[index]; const other = next[target]; if (!id || !other) return; next[index] = other; next[target] = id; onChange(next); };
 return <section className="team-members-section"><h2>Current members <small>{ids.length}</small></h2>{!ids.length && <p className="field-help">Add at least one agent to this team.</p>}<ul className="plain-list">{ids.map((id, index) => { const agent = agents.find(item => item.id === id); return agent ? <TeamMemberRow key={id} agent={agent} first={index === 0} last={index === ids.length - 1} onMove={direction => move(index, direction)} onRemove={() => onChange(ids.filter(item => item !== id))} /> : <li key={id}>Unavailable agent: {id}<button type="button" onClick={() => onChange(ids.filter(item => item !== id))}>Remove</button></li>; })}</ul></section>;
}
