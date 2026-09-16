export const orchestrationChannels = {
  followUp: 'orchestration:organizer-follow-up', continueAttention: 'orchestration:continue-attention',
  retryExecution: 'orchestration:retry-task',
  execute: 'orchestration:execute-task', cancelExecution: 'orchestration:cancel-task',
  create: 'orchestration:create-conversation', cancel: 'orchestration:cancel',
  get: 'orchestration:get-conversation', start: 'orchestration:start', continue: 'orchestration:continue',
  subscribe: 'orchestration:subscribe', changed: 'orchestration:changed',
} as const;
