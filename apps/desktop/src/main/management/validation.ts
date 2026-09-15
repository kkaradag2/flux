import { builtinAgentIcons, type AgentDefinition, type AgentInput, type TeamDefinition, type TeamInput } from '../../shared/management-api';
import { ManagementError } from './ManagementError';
export const fail = (message: string): never => { throw new ManagementError('VALIDATION', message); };
export function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('Invalid data.'); return value as Record<string, unknown>; }
function text(value: unknown, label: string, max = 10000): string { if (typeof value !== 'string' || value.length > max) return fail(label + ' is invalid.'); return value; }
function name(value: unknown): string { const result = text(value, 'Name', 100).trim(); return result || fail('Name is required.'); }
export function assetId(value: unknown): string { if (typeof value !== 'string' || !/^[a-f0-9-]{36}\.(png|jpg|jpeg|webp)$/.test(value)) return fail('Invalid avatar asset ID.'); return value; }
function immutable(data: Record<string, unknown>): void { for (const key of ['id', 'createdAt', 'updatedAt']) if (key in data) fail(key + ' cannot be supplied or changed.'); }
export function agentInput(value: unknown, stored = false): AgentInput {
 const data = record(value); if (!stored) immutable(data);
 const runtime = record(data.runtime); const avatar = record(data.avatar);
 if (runtime.type !== 'codex') fail('Only the Codex runtime is supported.');
 if (runtime.model !== null && (typeof runtime.model !== 'string' || !runtime.model.trim() || runtime.model.length > 200)) fail('Invalid model.');
 const effort = runtime.reasoningEffort;
 if (effort !== 'default' && effort !== 'low' && effort !== 'medium' && effort !== 'high') return fail('Invalid reasoning effort.');
 if (typeof data.enabled !== 'boolean') return fail('Enabled must be a boolean.');
 let validAvatar: AgentInput['avatar'];
 if (avatar.type === 'builtin') { const icon = builtinAgentIcons.find(item => item === avatar.value); if (!icon) return fail('Unknown avatar icon.'); validAvatar = { type: 'builtin', value: icon }; }
 else if (avatar.type === 'image') validAvatar = { type: 'image', assetId: assetId(avatar.assetId) };
 else return fail('Invalid avatar.');
 return { name: name(data.name), description: text(data.description, 'Description'), avatar: validAvatar, runtime: { type: 'codex', model: runtime.model as string | null, reasoningEffort: effort }, instructionsMarkdown: text(data.instructionsMarkdown, 'Instructions', 200000), enabled: data.enabled };
}
export function teamInput(value: unknown, stored = false): TeamInput {
 const data = record(value); if (!stored) immutable(data);
 if (!Array.isArray(data.agentIds) || !data.agentIds.length || data.agentIds.length > 1000 || !data.agentIds.every(id => typeof id === 'string' && id.length > 0 && id.length < 100)) return fail('A team must contain at least one valid agent.');
 const ids: string[] = data.agentIds;
 if (new Set(ids).size !== ids.length) fail('An agent cannot appear twice in a team.');
 return { name: name(data.name), description: text(data.description, 'Description'), agentIds: [...ids] };
}
function metadata(value: unknown): { id: string; createdAt: string; updatedAt: string } {
 const data = record(value); const id = text(data.id, 'ID', 100); if (!id) fail('ID is required.');
 const createdAt = text(data.createdAt, 'Created date', 50); const updatedAt = text(data.updatedAt, 'Updated date', 50);
 if (!Number.isFinite(Date.parse(createdAt)) || !Number.isFinite(Date.parse(updatedAt))) fail('Invalid date.');
 return { id, createdAt, updatedAt };
}
export const storedAgent = (value: unknown): AgentDefinition => ({ ...agentInput(value, true), ...metadata(value) });
export const storedTeam = (value: unknown): TeamDefinition => ({ ...teamInput(value, true), ...metadata(value) });
