import { useTeamManagement } from './ManagementContext';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useProjectWorkspace } from '../hooks/useProjectWorkspace';

export interface UserMessage { readonly id: string; readonly text: string; }
export interface WorkspaceSelections { project: string; environment: string; branch: string; }
interface WorkspaceState extends ReturnType<typeof useProjectWorkspace> {
  messages: readonly UserMessage[];
  taskKey: number;
  selectedTeamId: string | null;
  selectTeam: (id: string) => void;
  selections: WorkspaceSelections;
  newTask: () => void;
  sendMessage: (text: string) => void;
}
const WorkspaceContext = createContext<WorkspaceState | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<readonly UserMessage[]>([]);
  const [taskKey, setTaskKey] = useState(0);
  const projectWorkspace = useProjectWorkspace();
  const { teams } = useTeamManagement();
  const [teamId, setTeamId] = useState<string | null>(null);
  const selectedTeamId = teams.some(team => team.id === teamId) ? teamId : teams.find(team => team.id === 'core-team')?.id ?? teams[0]?.id ?? null;
  const selectTeam = useCallback((id: string) => { if (teams.some(team => team.id === id)) setTeamId(id); }, [teams]);
  const selections: WorkspaceSelections = { project: projectWorkspace.activeProject?.name ?? 'your project', environment: 'Local', branch: projectWorkspace.activeProject?.selectedBranch ?? '' };
  const newTask = useCallback(() => { setMessages([]); setTaskKey(key => key + 1); }, []);
  const sendMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (trimmed) setMessages(current => [...current, { id: crypto.randomUUID(), text: trimmed }]);
  }, []);
  const value = useMemo(() => ({ ...projectWorkspace, messages, taskKey, selections, newTask, sendMessage, selectedTeamId, selectTeam }), [projectWorkspace, messages, taskKey, selections, newTask, sendMessage, selectedTeamId, selectTeam]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('WorkspaceProvider is required.');
  return value;
}
