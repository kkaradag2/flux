import { useWorkspace } from '../../state/WorkspaceContext';
import { PromptComposer } from '../composer/PromptComposer';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatMessageList } from './ChatMessageList';
import { useNavigation } from '../../state/NavigationContext';
export function ChatWorkspace() {
  const { askOrganizer, continueAttention, retryTask, executeNextTask, orchestration, messages, selections, taskKey, sendMessage, loading, error, running, stop, runtimeReady, activeProject, selectedTeamId, conversation, opening, conversationError, historyError } = useWorkspace();
  const { navigate } = useNavigation();
  const activeTask = orchestration?.tasks.find(task => task.id === orchestration.execution?.activeTaskId);
  const planningActivity = orchestration?.followUp?.evaluating ? 'Organizer is evaluating' : orchestration?.execution?.checking ? 'Checking execution environment…' : activeTask ? `${activeTask.assignee.name} is working on ${activeTask.title}...` : orchestration?.run?.status === 'planning' ? `${orchestration.run.organizerName} is planning...` : null;
  const attention = orchestration?.tasks.find(task => task.status === 'needs_attention' || task.status === 'blocked');
  const runLabel = orchestration?.followUp?.evaluating ? 'Organizer is evaluating' : orchestration?.run ? ({ planning: 'Planning', running: activeTask ? 'Running' : attention ? attention.status === 'blocked' ? 'Blocked' : 'Needs attention' : 'Plan ready', waiting_input: 'Waiting for input', completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled' } as const)[orchestration.run.status] : null;
  return (
    <main className="chat-workspace" aria-label="Task workspace">
      <header className="workspace-header"><span>{conversation?.title ?? (messages.length ? 'Task' : 'New task')}</span>{conversation && <small className="conversation-status">{orchestration?.run ? runLabel : conversation.interrupted ? 'Interrupted' : running ? 'Running' : conversation.status === 'completed' ? 'Completed' : conversation.status === 'cancelled' ? 'Cancelled' : 'Failed'}</small>}</header>
      {opening ? <p className="workspace-notice" role="status">Loading conversation…</p> : messages.length ? <ChatMessageList messages={messages} orchestration={orchestration} planningName={planningActivity} onAskOrganizer={askOrganizer} onContinueAttention={continueAttention} onRetry={retryTask} onExecute={executeNextTask} onStop={stop} /> : <ChatEmptyState project={selections.project} />}
      <div className="composer-dock">
        {loading && <p className="workspace-notice" role="status">Loading project…</p>}
        {error && <p className="workspace-notice workspace-error" role="alert">{error}</p>}
        {(conversationError || historyError) && <p className="workspace-notice workspace-error" role="alert">{conversationError ?? historyError}</p>}
        {!runtimeReady && <p className="workspace-notice">Codex is not ready to use. <button type="button" className="chat-settings-link" onClick={() => navigate({ view: 'settings' })}>Open Settings</button> to check the runtime.</p>}
        <PromptComposer key={taskKey} focusOnMount={taskKey > 0} onSend={sendMessage} disabled={loading || opening || !runtimeReady || !activeProject || !selectedTeamId} running={running} onStop={stop} />
      </div>
    </main>
  );
}
