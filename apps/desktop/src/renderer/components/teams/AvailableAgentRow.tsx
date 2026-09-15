import type { AgentDefinition } from '../../../shared/management-api';
import { AgentAvatar } from '../avatars/AgentAvatar';
import { AgentStatus } from '../agents/AgentStatus';
export function AvailableAgentRow({ agent, onAdd }: { agent: AgentDefinition; onAdd: () => void }) { return <li className="team-edit-member"><AgentAvatar avatar={agent.avatar} /><span className="member-details"><strong>{agent.name}</strong><small>Codex · <AgentStatus enabled={agent.enabled} /></small></span><button type="button" className="agent-button" aria-label={'Add ' + agent.name} onClick={onAdd}>Add</button></li>; }
