import type { IpcRenderer, IpcRendererEvent } from 'electron';
import type { OrchestrationApi, OrchestrationChange } from '../shared/orchestration-api';
import { orchestrationChannels as channels } from '../shared/orchestration-channels';

export function createOrchestrationApi(ipc: Pick<IpcRenderer, 'invoke' | 'send' | 'on' | 'removeListener'>): OrchestrationApi {
  const listeners = new Map<(change: OrchestrationChange) => void, () => void>();
  return {
    retryTaskExecution: input => ipc.invoke(channels.retryExecution, input),
    startNextTaskExecution: input => ipc.invoke(channels.execute, input),
    cancelTaskExecution: input => ipc.invoke(channels.cancelExecution, input),
    createTeamConversation: input => ipc.invoke(channels.create, input),
    cancelTeamPrompt: input => ipc.invoke(channels.cancel, input),
    getConversationOrchestration: id => ipc.invoke(channels.get, id),
    startTeamPrompt: request => ipc.invoke(channels.start, request),
    continueTeamPrompt: request => ipc.invoke(channels.continue, request),
    subscribeToOrchestrationChanges: listener => {
      const existing = listeners.get(listener); if (existing) return existing;
      const receive = (_event: IpcRendererEvent, change: OrchestrationChange): void => listener(change);
      const unsubscribe = (): void => {
        if (!listeners.delete(listener)) return;
        ipc.removeListener(channels.changed, receive);
        if (!listeners.size) ipc.send(channels.subscribe, false);
      };
      listeners.set(listener, unsubscribe); ipc.on(channels.changed, receive);
      if (listeners.size === 1) ipc.send(channels.subscribe, true);
      return unsubscribe;
    },
  };
}
