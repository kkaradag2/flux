export const orchestrationChannels = {
  create: 'orchestration:create-conversation', cancel: 'orchestration:cancel',
  get: 'orchestration:get-conversation', start: 'orchestration:start', continue: 'orchestration:continue',
  subscribe: 'orchestration:subscribe', changed: 'orchestration:changed',
} as const;
