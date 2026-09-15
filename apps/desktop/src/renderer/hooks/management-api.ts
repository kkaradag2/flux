import type { ApiResult } from '../../shared/project-api';
export function unwrap<T>(result: ApiResult<T>): T { if (!result.ok) throw new Error(result.error.message); return result.value; }
export const errorMessage = (error: unknown): string => error instanceof Error ? error.message : 'The operation could not be completed.';
