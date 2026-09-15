import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConversationSummary } from '../../shared/conversation-api';
export function useConversationHistory() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const alive = useRef(false), revision = useRef(0);
  const refresh = useCallback(async (): Promise<void> => {
    const version = ++revision.current;
    try {
      const result = await window.flux.getConversations();
      if (!alive.current || version !== revision.current) return;
      if (result.ok) { setConversations(result.value); setHistoryError(null); }
      else setHistoryError('Conversation history could not be loaded. Saved files have been preserved.');
    } catch { if (alive.current && version === revision.current) setHistoryError('Conversation history could not be loaded.'); }
  }, []);
  useEffect(() => {
    alive.current = true; void refresh();
    const unsubscribe = window.flux.subscribeSingleAgentEvents(event => { if (event.type !== 'messageDelta') void refresh(); });
    return () => { alive.current = false; unsubscribe(); };
  }, [refresh]);
  return { conversations, historyError, refreshHistory: refresh };
}
