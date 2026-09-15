import { WorkspaceProvider } from './state/WorkspaceContext';
import { WorkspaceScreen } from './components/WorkspaceScreen';
export function App() {
  return <WorkspaceProvider><WorkspaceScreen /></WorkspaceProvider>;
}
