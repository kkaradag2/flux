import type { AgentDefinition } from '../../../shared/management-api';
import { AgentAvatar } from '../avatars/AgentAvatar';
import { AgentStatus } from './AgentStatus';
export function AgentListItem({ agent, onSelect }: { agent: AgentDefinition; onSelect: () => void }) { return <li><button type="button" className="management-row agent-columns" onClick={onSelect}><span className="record-identity"><AgentAvatar avatar={agent.avatar} /><span><strong>{agent.name}</strong><small>{agent.description}</small></span></span><span>Codex</span><span>{agent.runtime.model ?? 'Default'}</span><span className="capitalize">{agent.runtime.reasoningEffort}</span><AgentStatus enabled={agent.enabled} /><span aria-hidden="true">›</span></button></li>; }
