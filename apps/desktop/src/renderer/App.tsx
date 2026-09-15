import { WorkspaceProvider } from './state/WorkspaceContext';
import { AgentManagementProvider, TeamManagementProvider } from './state/ManagementContext';
import { NavigationProvider } from './state/NavigationContext';
import { WorkspaceScreen } from './components/WorkspaceScreen';
export function App() { return <AgentManagementProvider><TeamManagementProvider><WorkspaceProvider><NavigationProvider><WorkspaceScreen /></NavigationProvider></WorkspaceProvider></TeamManagementProvider></AgentManagementProvider>; }
