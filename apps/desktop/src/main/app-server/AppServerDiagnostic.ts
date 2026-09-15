import { SmokeTestError } from './contracts';
export type AppServerDiagnostic = Readonly<{
 method: 'initialize' | 'thread/start' | 'thread/resume' | 'turn/start' | 'turn/completed' | 'transport';
 category: 'RPC_ERROR' | 'RESPONSE_ID_MISMATCH' | 'MALFORMED_PROTOCOL' | 'TURN_FAILED' | 'OUTPUT_SCHEMA_REJECTED' | 'PROCESS_EXITED';
 protocolCode?: number;
}>;
export class AppServerDiagnosticError extends SmokeTestError {
 constructor(public readonly diagnostic: AppServerDiagnostic) { super('PROTOCOL_ERROR'); }
}
export function turnFailureDiagnostic(value: unknown): AppServerDiagnosticError {
 const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
 const message = typeof data.message === 'string' ? data.message.slice(0, 8192) : '';
 const schemaRejected = /(?:schema|response_format|outputSchema)/i.test(message) && /(?:invalid|unsupported|not supported|must|not permitted|required)/i.test(message);
 return new AppServerDiagnosticError({ method: 'turn/completed', category: schemaRejected ? 'OUTPUT_SCHEMA_REJECTED' : 'TURN_FAILED' });
}
