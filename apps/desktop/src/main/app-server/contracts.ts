import type { SmokeTestErrorCode } from '../../shared/codex-smoke-test';
export class SmokeTestError extends Error { constructor(public readonly code: SmokeTestErrorCode, public readonly verificationReason: import('../../shared/codex-runtime-state').VerificationReason | null = null) { super(code); } }
export function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function requiredString(value: unknown): string { if (typeof value !== 'string' || !value || value.length > 65536) throw new SmokeTestError('PROTOCOL_ERROR'); return value; }
export function object(value: unknown): Record<string, unknown> { if (!record(value)) throw new SmokeTestError('PROTOCOL_ERROR'); return value; }
export function identifier(value: unknown): string { const id = requiredString(value); if (id.length > 200) throw new SmokeTestError('PROTOCOL_ERROR'); return id; }
export const HELLO = 'Hello from Flux.';
export const SMOKE_PROMPT = 'Reply with exactly: Hello from Flux.\nDo not inspect or modify files. Do not run commands or use tools.';
export type AppServerJsonValue = string | number | boolean | null | readonly AppServerJsonValue[] | { readonly [key: string]: AppServerJsonValue };
// Minimal subset verified against codex-cli 0.151.0 generate-ts output.
export interface AppServerRequests {
  initialize: { clientInfo: { name: string; title: string; version: string }; capabilities: { experimentalApi: false } };
  'thread/start': { cwd: string; approvalPolicy: 'never'; sandbox: 'read-only' | 'workspace-write'; ephemeral: boolean; developerInstructions?: string; model?: string; config?: { web_search: 'disabled'; mcp_servers: Record<string, { enabled: false }>; plugins: Record<string, { enabled: false }>; 'features.apps': false; 'features.multi_agent': false; 'sandbox_workspace_write.writable_roots'?: string[]; 'sandbox_workspace_write.network_access'?: false; 'sandbox_workspace_write.exclude_tmpdir_env_var'?: true; 'sandbox_workspace_write.exclude_slash_tmp'?: true } };
  'thread/resume': Omit<AppServerRequests['thread/start'], 'ephemeral'> & { threadId: string; excludeTurns: true };
  'turn/start': { threadId: string; input: [{ type: 'text'; text: string; text_elements: [] }]; approvalPolicy: 'never'; sandboxPolicy: { type: 'readOnly'; networkAccess: false } | { type: 'workspaceWrite'; writableRoots: string[]; networkAccess: false; excludeTmpdirEnvVar: true; excludeSlashTmp: true }; effort?: 'low' | 'medium' | 'high'; outputSchema?: AppServerJsonValue };
  'turn/interrupt': { threadId: string; turnId: string };
  'mcpServerStatus/list': { threadId?: string; detail: 'toolsAndAuthOnly'; limit: number; cursor?: string };
}
export interface ServerNotification { method: string; params: unknown; }
export interface ServerRequest extends ServerNotification { id: string | number; }
