import type { RequestPreview } from '../../data/workspace-preview';
import { SidebarItem } from '../shared/SidebarItem';

interface RequestHistoryListProps {
  requests: readonly RequestPreview[];
  selectedId?: string | undefined;
  onSelect?: ((id: string) => void) | undefined;
}
export function RequestHistoryList({ requests, selectedId, onSelect }: RequestHistoryListProps) {
  return (
    <nav className="request-history" aria-label="Recent conversations">
      <ul className="plain-list">
        {requests.map(request => (
          <li key={request.id}>
            <SidebarItem label={request.title} selected={selectedId === request.id} trailing={<span className="history-time">{request.updatedLabel}</span>} onClick={() => onSelect?.(request.id)} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
