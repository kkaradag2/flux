import { useCallback, useEffect, useState } from 'react';
import type { AgentDefinition, AgentInput } from '../../shared/management-api';
import { unwrap, errorMessage } from './management-api';
export function useAgents() {
 const [agents, setAgents] = useState<AgentDefinition[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
 const refresh = useCallback(async () => { setLoading(true); try { setAgents(unwrap(await window.flux.getAgents())); setError(null); } catch (cause) { setError(errorMessage(cause)); } finally { setLoading(false); } }, []);
 useEffect(() => { void refresh(); }, [refresh]);
 const save = useCallback(async (id: string | null, input: AgentInput) => { const agent = unwrap(await (id ? window.flux.updateAgent(id, input) : window.flux.createAgent(input))); setAgents(current => id ? current.map(item => item.id === id ? agent : item) : [...current, agent]); return agent; }, []);
 return { agents, loading, error, refresh, save };
}
