export class ProjectError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'ProjectError';
  }
}

export function errorCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
}
