import { useTeamManagement } from '../../state/ManagementContext';
import { useNavigation } from '../../state/NavigationContext';
import { TeamsHeader } from './TeamsHeader';
import { TeamList } from './TeamList';
export function TeamsScreen() { const { teams, loading, error, refresh } = useTeamManagement(); const { navigate } = useNavigation(); return <section className="management-screen"><TeamsHeader />{loading && <p role="status">Loading teams…</p>}{error && <p role="alert" className="workspace-error">{error} <button className="agent-button" onClick={() => void refresh()}>Retry</button></p>}<TeamList teams={teams} onSelect={id => navigate({ view: 'team-edit', id })} /></section>; }
