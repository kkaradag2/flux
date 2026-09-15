import { useState } from 'react';
export function useSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  return { collapsed, historyExpanded, toggle: () => setCollapsed(value => !value), toggleHistory: () => setHistoryExpanded(value => !value) };
}
