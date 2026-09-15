import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useProjectWorkspace } from '../hooks/useProjectWorkspace';

export interface UserMessage { readonly id: string; readonly text: string; }
export interface WorkspaceSelections { project: string; environment: string; branch: string; }
interface WorkspaceState extends ReturnType<typeof useProjectWorkspace> {
  messages: readonly UserMessage[];
  taskKey: number;
  selections: WorkspaceSelections;
  newTask: () => void;
  sendMessage: (text: string) => void;
}
const WorkspaceContext = createContext<WorkspaceState | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<readonly UserMessage[]>([]);
  const [taskKey, setTaskKey] = useState(0);
  const projectWorkspace = useProjectWorkspace();
  const selections: WorkspaceSelections = { project: projectWorkspace.activeProject?.name ?? 'your project', environment: 'Local', branch: projectWorkspace.activeProject?.selectedBranch ?? '' };
  const newTask = useCallback(() => { setMessages([]); setTaskKey(key => key + 1); }, []);
  const sendMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (trimmed) setMessages(current => [...current, { id: crypto.randomUUID(), text: trimmed }]);
  }, []);
  const value = useMemo(() => ({ ...projectWorkspace, messages, taskKey, selections, newTask, sendMessage }), [projectWorkspace, messages, taskKey, selections, newTask, sendMessage]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('WorkspaceProvider is required.');
  return value;
}
