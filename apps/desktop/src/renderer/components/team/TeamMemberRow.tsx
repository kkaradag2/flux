import type { AgentDefinition } from '../../../shared/management-api';
import { AgentAvatar } from '../avatars/AgentAvatar';
export function TeamMemberRow({ member }: { member: AgentDefinition }) { return <li className="team-member"><AgentAvatar avatar={member.avatar} size={24} /><div className="team-member-content"><div className="team-member-name">{member.name}</div><div className="team-runtime">Codex</div></div><span className="team-status"><span className="team-status-dot" aria-hidden="true" />{member.enabled ? 'Idle' : 'Disabled'}</span></li>; }
