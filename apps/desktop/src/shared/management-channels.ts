export const managementChannels = {
 getAgents: 'flux:agents:list', getAgent: 'flux:agents:get', createAgent: 'flux:agents:create', updateAgent: 'flux:agents:update',
 selectAgentAvatarImage: 'flux:agents:select-avatar', getAgentAvatarDataUrl: 'flux:agents:avatar-data',
 getTeams: 'flux:teams:list', getTeam: 'flux:teams:get', createTeam: 'flux:teams:create', updateTeam: 'flux:teams:update',
} as const;
