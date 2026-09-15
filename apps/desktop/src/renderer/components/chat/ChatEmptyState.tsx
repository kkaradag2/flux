import { Icon } from '../shared/Icon';

interface ChatEmptyStateProps {
  title?: string | undefined;
  project: string;
}

export function ChatEmptyState({ title, project }: ChatEmptyStateProps) {
  return (
    <div className="chat-empty-state">
      <div className="empty-state-content">
        <span className="empty-state-mark"><Icon name="terminal" size={38} /></span>
        <h1>{title ?? <>What should we build in <span className="empty-state-project">{project}</span>?</>}</h1>
      </div>
    </div>
  );
}
