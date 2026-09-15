import type { ApiResult } from './project-api';
export type RuntimeHealthStatus = 'checking' | 'ready' | 'not-installed' | 'not-authenticated' | 'error';
export type CodexRuntimeHealth = {
  runtime: 'codex';
  status: RuntimeHealthStatus;
  version: string | null;
  authenticationMethod: string | null;
  message: string;
  checkedAt: string;
};
export interface RuntimeHealthApi {
  getCodexRuntimeHealth(): Promise<ApiResult<CodexRuntimeHealth>>;
  refreshCodexRuntimeHealth(): Promise<ApiResult<CodexRuntimeHealth>>;
}
