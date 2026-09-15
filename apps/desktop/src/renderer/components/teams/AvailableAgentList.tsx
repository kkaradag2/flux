import type { AgentDefinition } from '../../../shared/management-api';
import { AvailableAgentRow } from './AvailableAgentRow';
export function AvailableAgentList({ agents, onAdd }: { agents: AgentDefinition[]; onAdd: (id: string) => void }) { return <section className="team-members-section"><h2>Available agents</h2>{!agents.length && <p className="field-help">All agents are already in this team.</p>}<ul className="plain-list">{agents.map(agent => <AvailableAgentRow key={agent.id} agent={agent} onAdd={() => onAdd(agent.id)} />)}</ul></section>; }
