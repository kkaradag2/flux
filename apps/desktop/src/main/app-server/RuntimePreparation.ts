import path from 'node:path';
import { realpath, stat } from 'node:fs/promises';
import { AppServerDiagnosticError } from './AppServerDiagnostic';
import { record } from './contracts';
export type PreparationCode = 'installation_not_ready' | 'runtime_capability_missing' | 'unsupported_runtime_version' | 'invalid_working_directory' | 'workspace_identity_mismatch' | 'workspace_outside_managed_root' | 'sandbox_policy_invalid' | 'thread_policy_mismatch' | 'generated_contract_mismatch' | 'thread_start_rejected' | 'session_verification_failed' | 'unknown_validation_failure';
export type PreparationField = 'cwd' | 'approvalPolicy' | 'sandbox' | 'networkAccess' | 'excludeTmpdirEnvVar' | 'excludeSlashTmp' | 'writableRoots' | 'thread' | 'inventory' | 'runtime' | 'initialize';
export type PreparationStage = 'Runtime source resolved' | 'Worktree identity verified' | 'CWD accepted' | 'Sandbox request accepted' | 'Thread started' | 'Returned policy verified' | 'Cleanup completed';
export function preparationError(subcode: PreparationCode, field?: PreparationField, protocolCode?: number): AppServerDiagnosticError {
 return new AppServerDiagnosticError({ method: 'thread/start', category: 'PREPARATION_FAILED', stage: 'runtime_preparation', subcode, ...(field ? { field } : {}), ...(typeof protocolCode === 'number' && Number.isSafeInteger(protocolCode) ? { protocolCode } : {}) });
}
function key(value: string): string { const normalized = path.normalize(value); return process.platform === 'win32' ? normalized.toLowerCase() : normalized; }
/** Read-only identity check; callers supply the persisted, Flux-owned expected location. */
export async function verifyManagedWorkingDirectory(cwd: string, root: string, expected: string): Promise<void> {
 if (!path.isAbsolute(cwd) || /[\0\r\n]/.test(cwd)) throw preparationError('invalid_working_directory', 'cwd');
 const relative = path.relative(root, cwd);
 if (!relative || relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) throw preparationError('workspace_outside_managed_root', 'cwd');
 if (key(cwd) !== key(expected)) throw preparationError('workspace_identity_mismatch', 'cwd');
 try {
  const [actual, managed] = await Promise.all([realpath(cwd), realpath(root)]);
  const resolved = path.relative(managed, actual);
  if (!resolved || resolved === '..' || resolved.startsWith('..' + path.sep) || path.isAbsolute(resolved)) throw preparationError('workspace_outside_managed_root', 'cwd');
  if (!(await stat(cwd)).isDirectory()) throw preparationError('invalid_working_directory', 'cwd');
 } catch (error) { if (error instanceof AppServerDiagnosticError) throw error; throw preparationError('invalid_working_directory', 'cwd'); }
}
/** 0.154.0 legacy workspaceWrite roots are additional to cwd, not the complete write set. */
export function verifyTaskThreadPolicy(value: unknown, cwd: string): void {
 if (!record(value) || !record(value.sandbox)) throw preparationError('generated_contract_mismatch', 'sandbox');
 if (typeof value.cwd !== 'string' || !path.isAbsolute(value.cwd) || key(value.cwd) !== key(cwd)) throw preparationError('workspace_identity_mismatch', 'cwd');
 if (value.approvalPolicy !== 'never') throw preparationError('thread_policy_mismatch', 'approvalPolicy');
 const sandbox = value.sandbox;
 if (sandbox.type !== 'workspaceWrite') throw preparationError('thread_policy_mismatch', 'sandbox');
 for (const [field, expected] of [['networkAccess', false], ['excludeTmpdirEnvVar', true], ['excludeSlashTmp', true]] as const) {
  if (sandbox[field] !== expected) throw preparationError('sandbox_policy_invalid', field);
 }
 if (!Array.isArray(sandbox.writableRoots) || sandbox.writableRoots.some(root => typeof root !== 'string' || !path.isAbsolute(root) || key(root) !== key(cwd))) throw preparationError('sandbox_policy_invalid', 'writableRoots');
}
