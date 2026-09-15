import { createContext, useContext, type ReactNode } from 'react';
import { useAgents } from '../hooks/useAgents';
import { useTeams } from '../hooks/useTeams';
const AgentManagementContext = createContext<ReturnType<typeof useAgents> | null>(null);
const TeamManagementContext = createContext<ReturnType<typeof useTeams> | null>(null);
export function AgentManagementProvider({ children }: { children: ReactNode }) { const value = useAgents(); return <AgentManagementContext.Provider value={value}>{children}</AgentManagementContext.Provider>; }
export function TeamManagementProvider({ children }: { children: ReactNode }) { const value = useTeams(); return <TeamManagementContext.Provider value={value}>{children}</TeamManagementContext.Provider>; }
export function useAgentManagement() { const value = useContext(AgentManagementContext); if (!value) throw new Error('Agent provider required'); return value; }
export function useTeamManagement() { const value = useContext(TeamManagementContext); if (!value) throw new Error('Team provider required'); return value; }
