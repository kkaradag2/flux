import { useCallback, useEffect, useState } from 'react';
import type { TeamDefinition, TeamInput } from '../../shared/management-api';
import { unwrap, errorMessage } from './management-api';
export function useTeams() {
 const [teams, setTeams] = useState<TeamDefinition[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
 const refresh = useCallback(async () => { setLoading(true); try { setTeams(unwrap(await window.flux.getTeams())); setError(null); } catch (cause) { setError(errorMessage(cause)); } finally { setLoading(false); } }, []);
 useEffect(() => { void refresh(); }, [refresh]);
 const save = useCallback(async (id: string | null, input: TeamInput) => { const team = unwrap(await (id ? window.flux.updateTeam(id, input) : window.flux.createTeam(input))); setTeams(current => id ? current.map(item => item.id === id ? team : item) : [...current, team]); return team; }, []);
 return { teams, loading, error, refresh, save };
}
