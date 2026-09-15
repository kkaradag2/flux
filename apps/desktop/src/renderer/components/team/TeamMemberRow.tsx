import type { TeamMember } from '../../data/core-team';
import { Icon } from '../shared/Icon';

export function TeamMemberRow({ member }: { member: TeamMember }) {
  return (
    <li className={'team-member team-member--' + member.status}>
      <span className="team-avatar"><Icon name="agents" size={17} /></span>
      <div className="team-member-content">
        <div className="team-member-name">{member.name}</div>
        <div className="team-runtime">{member.runtime}</div>
      </div>
      <span className={'team-status team-status--' + member.status} aria-label={member.name + ': ' + member.status}>
        <span className="team-status-dot" aria-hidden="true" />
        {member.status === 'working' ? 'Working' : 'Idle'}
      </span>
    </li>
  );
}
