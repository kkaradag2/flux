// Main/preload transport details. Never imported by the renderer.
export const projectChannels = {
  selectDirectory: 'flux:projects:select-directory',
  add: 'flux:projects:add',
  list: 'flux:projects:list',
  branches: 'flux:projects:branches',
  currentBranch: 'flux:projects:current-branch',
  selectWorkspace: 'flux:projects:select-workspace',
} as const;
