import type { AgentDefinition } from '../../../shared/management-api';
import { useAgentEditor } from '../../hooks/useAgentEditor';
import { AgentAvatar } from '../avatars/AgentAvatar';
import { AgentAvatarPicker } from '../avatars/AgentAvatarPicker';
import { MarkdownInstructionEditor } from '../markdown/MarkdownInstructionEditor';
import { AgentGeneralFields } from './AgentGeneralFields';
import { AgentRuntimeFields } from './AgentRuntimeFields';
import { AgentEnabledToggle } from './AgentEnabledToggle';
import { AgentEditorActions } from './AgentEditorActions';
export function AgentEditor({ agent }: { agent?: AgentDefinition }) {
 const editor = useAgentEditor(agent);
 return <section className="management-editor-screen"><button type="button" className="back-button" disabled={editor.saving} onClick={editor.cancel}>‹ Agents</button><header className="record-editor-header"><AgentAvatar avatar={editor.draft.avatar} size={40} /><div><h1>{agent?.name ?? 'New agent'}</h1><p>Agent configuration</p></div></header><form className="agent-editor" onSubmit={event => { event.preventDefault(); void editor.submit(); }}><fieldset disabled={editor.saving}>
 <AgentAvatarPicker value={editor.draft.avatar} onChange={avatar => editor.change({ avatar })} /><AgentGeneralFields agent={editor.draft} onChange={editor.change} /><AgentRuntimeFields agent={editor.draft} onChange={editor.change} /><MarkdownInstructionEditor value={editor.draft.instructionsMarkdown} onChange={instructionsMarkdown => editor.change({ instructionsMarkdown })} /><AgentEnabledToggle enabled={editor.draft.enabled} onChange={enabled => editor.change({ enabled })} />
 </fieldset>{editor.error && <p role="alert" className="workspace-error">{editor.error}</p>}<AgentEditorActions onCancel={editor.cancel} saving={editor.saving} create={!agent} canSave={Boolean(editor.draft.name.trim()) && (!agent || editor.dirty)} /></form></section>;
}
