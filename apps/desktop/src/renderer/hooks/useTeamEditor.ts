import type { TeamDefinition, TeamInput } from '../../shared/management-api';
import { useTeamManagement } from '../state/ManagementContext';
import { useEditorDraft } from './useEditorDraft';
export function useTeamEditor(team?: TeamDefinition) { const { save } = useTeamManagement(); const initial: TeamInput = { name: team?.name ?? '', description: team?.description ?? '', agentIds: team?.agentIds ?? [], organizerAgentId: team?.organizerAgentId ?? null }; return useEditorDraft(initial, draft => save(team?.id ?? null, draft), { view: 'teams-list' }, !team); }
