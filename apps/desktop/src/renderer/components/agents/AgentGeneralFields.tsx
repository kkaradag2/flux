import type { AgentInput } from '../../../shared/management-api';
export interface AgentFieldProps { agent: AgentInput; onChange: (patch: Partial<AgentInput>) => void; }
export function AgentGeneralFields({ agent, onChange }: AgentFieldProps) { return <div className="agent-field-group"><label>Name<input required maxLength={100} value={agent.name} onChange={event => onChange({ name: event.target.value })} /></label><label>Description<textarea rows={2} maxLength={10000} value={agent.description} onChange={event => onChange({ description: event.target.value })} /></label></div>; }
