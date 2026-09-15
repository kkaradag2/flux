import type { AgentDefinition } from '../../../shared/management-api';

export function TeamOrganizerField({ members, organizerAgentId, onChange }: {
  members: readonly AgentDefinition[];
  organizerAgentId: string | null;
  onChange: (id: string | null) => void;
}) {
  const organizer = members.find(member => member.id === organizerAgentId);
  return <div className="team-organizer-field">
    <label>Organizer<select required value={organizerAgentId ?? ''} onChange={event => onChange(event.target.value || null)}>
      <option value="" disabled>Choose an Organizer</option>
      {members.map(member => <option key={member.id} value={member.id}>{member.name}{!member.enabled ? ' (Disabled)' : ''}</option>)}
    </select></label>
    <p className="field-help">The Organizer plans the team's work. A team needs at least two different agents.</p>
    {organizer && !organizer.enabled && <p className="organizer-warning" role="status">The selected Organizer is disabled. This assignment will be preserved when you save.</p>}
  </div>;
}
