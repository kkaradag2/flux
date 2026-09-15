import type { AgentDefinition, AgentInput } from '../../shared/management-api';
import { useAgentManagement } from '../state/ManagementContext';
import { useEditorDraft } from './useEditorDraft';
export function agentDraft(agent?: AgentDefinition): AgentInput { return agent ? { name: agent.name, description: agent.description, avatar: agent.avatar, runtime: agent.runtime, instructionsMarkdown: agent.instructionsMarkdown, enabled: agent.enabled } : { name: '', description: '', avatar: { type: 'builtin', value: 'robot' }, runtime: { type: 'codex', model: null, reasoningEffort: 'default' }, instructionsMarkdown: '', enabled: true }; }
export function useAgentEditor(agent?: AgentDefinition) { const { save } = useAgentManagement(); return useEditorDraft(agentDraft(agent), draft => save(agent?.id ?? null, draft), { view: 'agents-list' }, !agent); }
