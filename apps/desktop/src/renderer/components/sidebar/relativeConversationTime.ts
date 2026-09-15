export function relativeConversationTime(updatedAt: string, now = Date.now()): string {
  const elapsed = Math.max(0, now - Date.parse(updatedAt));
  if (!Number.isFinite(elapsed) || elapsed < 60000) return 'now';
  if (elapsed < 3600000) return Math.floor(elapsed / 60000) + 'm';
  if (elapsed < 86400000) return Math.floor(elapsed / 3600000) + 'h';
  return Math.floor(elapsed / 86400000) + 'd';
}
