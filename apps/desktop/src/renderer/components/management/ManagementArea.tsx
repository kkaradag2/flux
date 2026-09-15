import { useNavigation } from '../../state/NavigationContext';
import { AgentsScreen } from '../agents/AgentsScreen';
import { AgentCreateScreen } from '../agents/AgentCreateScreen';
import { AgentEditScreen } from '../agents/AgentEditScreen';
import { TeamsScreen } from '../teams/TeamsScreen';
import { TeamCreateScreen } from '../teams/TeamCreateScreen';
import { TeamEditScreen } from '../teams/TeamEditScreen';
export function ManagementArea() {
 const { route, navigate, saving } = useNavigation(); const teams = route.view.startsWith('team');
 return <div className="management-area"><nav className="management-tabs" aria-label="Agent management"><button type="button" disabled={saving} aria-current={!teams ? 'page' : undefined} onClick={() => navigate({ view: 'agents-list' })}>Agents</button><button type="button" disabled={saving} aria-current={teams ? 'page' : undefined} onClick={() => navigate({ view: 'teams-list' })}>Teams</button></nav>
 {route.view === 'agents-list' && <AgentsScreen />}{route.view === 'agent-create' && <AgentCreateScreen />}{route.view === 'agent-edit' && <AgentEditScreen id={route.id} />}{route.view === 'teams-list' && <TeamsScreen />}{route.view === 'team-create' && <TeamCreateScreen />}{route.view === 'team-edit' && <TeamEditScreen id={route.id} />}</div>;
}
