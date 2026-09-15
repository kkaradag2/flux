import type { AgentDefinition } from '../../../shared/management-api';
import { AgentAvatar } from '../avatars/AgentAvatar';
import { OrganizerBadge } from '../teams/OrganizerBadge';
export function TeamMemberRow({ member, working = false, organizer = false }: { member: AgentDefinition; working?: boolean; organizer?: boolean }) {
  return (
    <li className={'team-member' + (working ? ' team-member--working' : '')}>
      <AgentAvatar avatar={member.avatar} size={24} />
      <div className="team-member-content">
        <div className="team-member-name">{member.name} {organizer && <OrganizerBadge />}</div>
        <div className="team-runtime">Codex</div>
      </div>
      <span className={'team-status' + (working ? ' team-status--working' : '')}>
        <span className="team-status-dot" aria-hidden="true" />
        {working ? 'Working' : member.enabled ? 'Idle' : 'Disabled'}
      </span>
    </li>
  );
}
