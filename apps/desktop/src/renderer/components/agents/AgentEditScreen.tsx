import { useAgentManagement } from '../../state/ManagementContext';
import { AgentEditor } from './AgentEditor';
export function AgentEditScreen({ id }: { id: string }) { const { agents } = useAgentManagement(); const agent = agents.find(item => item.id === id); return agent ? <AgentEditor key={id} agent={agent} /> : <p role="alert">Agent not found. Return to Agents and refresh the list.</p>; }
