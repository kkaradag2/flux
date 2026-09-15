export class ManagementError extends Error { constructor(public readonly code: string, message: string) { super(message); } }
