import { useWorkspace } from '../../state/WorkspaceContext';
import { PromptComposer } from '../composer/PromptComposer';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatMessageList } from './ChatMessageList';
export function ChatWorkspace() {
  const { messages, selections, taskKey, sendMessage, loading, error } = useWorkspace();
  return (
    <main className="chat-workspace" aria-label="Task workspace">
      <header className="workspace-header"><span>{messages.length ? 'Task' : 'New task'}</span></header>
      {messages.length ? <ChatMessageList messages={messages} /> : <ChatEmptyState project={selections.project} />}
      <div className="composer-dock">
        {loading && <p className="workspace-notice" role="status">Loading project…</p>}
        {error && <p className="workspace-notice workspace-error" role="alert">{error}</p>}
        <PromptComposer key={taskKey} focusOnMount={taskKey > 0} onSend={sendMessage} />
      </div>
    </main>
  );
}
