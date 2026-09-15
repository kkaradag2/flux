import { useAgentManagement } from '../../state/ManagementContext';
import { useNavigation } from '../../state/NavigationContext';
import { AgentsHeader } from './AgentsHeader';
import { AgentList } from './AgentList';
export function AgentsScreen() { const { agents, loading, error, refresh } = useAgentManagement(); const { navigate } = useNavigation(); return <section className="management-screen"><AgentsHeader />{loading && <p role="status">Loading agents…</p>}{error && <p role="alert" className="workspace-error">{error} <button className="agent-button" onClick={() => void refresh()}>Retry</button></p>}<AgentList agents={agents} onSelect={id => navigate({ view: 'agent-edit', id })} /></section>; }
