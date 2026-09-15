import { useState } from 'react';

export type WorkspacePanelTab = 'tasks' | 'team';

// Owned by WorkspaceScreen, which remains mounted during screen navigation.
export function useWorkspacePanel(taskCount: number) {
  const [selection, selectTab] = useState<WorkspacePanelTab | null>(null);
  return { selectedTab: selection ?? (taskCount > 0 ? 'tasks' : 'team'), selectTab } as const;
}
