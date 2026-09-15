import { useEffect, useState } from 'react';
import type { ConversationSummary } from '../../../shared/conversation-api';
import { relativeConversationTime } from './relativeConversationTime';
import { SidebarItem } from '../shared/SidebarItem';

interface RequestHistoryListProps {
  requests: readonly ConversationSummary[];
  selectedId?: string | undefined;
  onSelect?: ((id: string) => void) | undefined;
}
export function RequestHistoryList({ requests, selectedId, onSelect }: RequestHistoryListProps) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!requests.length) return; const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, [requests.length]);
  if (!requests.length) return null;
  return (
    <nav className="request-history" aria-label="Recent conversations">
      <ul className="plain-list">
        {[...requests].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(request => (
          <li key={request.id}>
            <SidebarItem label={request.title} selected={selectedId === request.id} trailing={<span className="history-time">{relativeConversationTime(request.updatedAt, now)}</span>} onClick={() => onSelect?.(request.id)} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
