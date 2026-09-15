import { useTeamManagement } from './ManagementContext';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useProjectWorkspace } from '../hooks/useProjectWorkspace';
import { useSingleAgentChat, type ChatMessage } from '../hooks/useSingleAgentChat';
import { useConversationHistory } from '../hooks/useConversationHistory';
import type { ConversationDetail, ConversationSummary } from '../../shared/conversation-api';

export interface WorkspaceSelections { project: string; environment: string; branch: string; }
interface WorkspaceState extends ReturnType<typeof useProjectWorkspace> {
  messages: readonly ChatMessage[];
  running: boolean;
  workingAgentId: string | null;
  runtimeReady: boolean;
  stop: () => void;
  conversation: ConversationDetail | null;
  conversations: ConversationSummary[];
  historyError: string | null;
  conversationError: string | null;
  opening: boolean;
  openConversation: (id: string) => Promise<boolean>;
  taskKey: number;
  selectedTeamId: string | null;
  selectTeam: (id: string) => void;
  selections: WorkspaceSelections;
  newTask: () => void;
  sendMessage: (text: string) => boolean;
}
const WorkspaceContext = createContext<WorkspaceState | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const chat = useSingleAgentChat();
  const history = useConversationHistory();
  const [taskKey, setTaskKey] = useState(0);
  const projectWorkspace = useProjectWorkspace();
  const { teams } = useTeamManagement();
  const [teamId, setTeamId] = useState<string | null>(null);
  const selectedTeamId = chat.conversation?.teamId ?? (teams.some(team => team.id === teamId) ? teamId : teams.find(team => team.id === 'core-team')?.id ?? teams[0]?.id ?? null);
  const selectTeam = useCallback((id: string) => { if (teams.some(team => team.id === id)) setTeamId(id); }, [teams]);
  const selections: WorkspaceSelections = { project: projectWorkspace.activeProject?.name ?? 'your project', environment: 'Local', branch: projectWorkspace.activeProject?.selectedBranch ?? '' };
  const newTask = useCallback(() => { chat.reset(); setTaskKey(key => key + 1); }, [chat.reset]);
  const sendMessage = useCallback((text: string) => {
    if (!projectWorkspace.activeProject || !selectedTeamId || projectWorkspace.loading || chat.opening) return false;
    return chat.send({ projectId: projectWorkspace.activeProject.id, branch: projectWorkspace.activeProject.selectedBranch, teamId: selectedTeamId, prompt: text });
  }, [chat.send, chat.opening, projectWorkspace.activeProject, projectWorkspace.loading, selectedTeamId]);
  const openConversation = useCallback(async (id: string): Promise<boolean> => {
    const opened = await chat.openConversation(id, async (detail, isCurrent) => {
      const activated = await projectWorkspace.activateConversation(detail.projectId, detail.branchName, isCurrent);
      if (activated) setTeamId(detail.teamId);
      return activated;
    });
    if (opened) { setTaskKey(key => key + 1); void history.refreshHistory(); }
    return opened;
  }, [chat.openConversation, projectWorkspace.activateConversation, history.refreshHistory]);
  const selectProject = useCallback(async (id: string): Promise<void> => {
    if (chat.running || chat.opening) return;
    newTask(); await projectWorkspace.selectProject(id);
  }, [chat.running, chat.opening, newTask, projectWorkspace.selectProject]);
  const value = useMemo(() => ({ ...projectWorkspace, ...chat, ...history, taskKey, selections, newTask, sendMessage, selectedTeamId, selectTeam, openConversation, selectProject }), [projectWorkspace, chat, history, taskKey, selections, newTask, sendMessage, selectedTeamId, selectTeam, openConversation, selectProject]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('WorkspaceProvider is required.');
  return value;
}
