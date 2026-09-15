import { coreTeamMembers, type TeamMember } from '../../data/core-team';
import { TeamMemberRow } from './TeamMemberRow';

interface TeamPanelProps {
  name?: string;
  members?: readonly TeamMember[];
}

export function TeamPanel({ name = 'Core Team', members = coreTeamMembers }: TeamPanelProps) {
  return (
    <aside className="workspace-inspector" aria-label="Team summary">
      <section className="team-panel" aria-labelledby="team-heading">
        <header className="team-summary-header">
          <h2 id="team-heading">{name}</h2>
          <p>{members.length} agents</p>
        </header>
        <ul className="plain-list team-list" aria-label="Team members">
          {members.map(member => <TeamMemberRow key={member.id} member={member} />)}
        </ul>
      </section>
    </aside>
  );
}
