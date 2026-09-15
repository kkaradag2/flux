import { useTeamManagement } from '../../state/ManagementContext';
import { TeamEditor } from './TeamEditor';
export function TeamEditScreen({ id }: { id: string }) { const { teams } = useTeamManagement(); const team = teams.find(item => item.id === id); return team ? <TeamEditor key={id} team={team} /> : <p role="alert">Team not found. Return to Teams and refresh the list.</p>; }
