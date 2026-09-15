import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export interface UserMessage { readonly id: string; readonly text: string; }
export interface WorkspaceSelections { project: string; environment: string; branch: string; }
interface WorkspaceState {
  messages: readonly UserMessage[];
  taskKey: number;
  selections: WorkspaceSelections;
  newTask: () => void;
  sendMessage: (text: string) => void;
  select: (key: keyof WorkspaceSelections, value: string) => void;
}
const WorkspaceContext = createContext<WorkspaceState | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<readonly UserMessage[]>([]);
  const [taskKey, setTaskKey] = useState(0);
  const [selections, setSelections] = useState<WorkspaceSelections>({ project: 'Flux', environment: 'Local', branch: 'main' });
  const newTask = useCallback(() => { setMessages([]); setTaskKey(key => key + 1); }, []);
  const sendMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (trimmed) setMessages(current => [...current, { id: crypto.randomUUID(), text: trimmed }]);
  }, []);
  const select = useCallback((key: keyof WorkspaceSelections, value: string) => setSelections(current => ({ ...current, [key]: value })), []);
  const value = useMemo(() => ({ messages, taskKey, selections, newTask, sendMessage, select }), [messages, taskKey, selections, newTask, sendMessage, select]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('WorkspaceProvider is required.');
  return value;
}
