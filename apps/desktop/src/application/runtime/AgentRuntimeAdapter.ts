import type { AgentRuntimeType, AgentSessionReference, RuntimeModelSettings } from '../../shared/agent-runtime';
export type RuntimeCapabilities = Readonly<{
 structuredOutput: boolean; persistentSessions: boolean; streaming: boolean; cancellation: boolean;
 toolExecution: boolean; workingDirectory: boolean; sandboxing: boolean;
}>;
export type RuntimeTurnRequest = Readonly<{
 instructions: string; prompt: string; settings: RuntimeModelSettings; cwd: string;
 /** Awaited before model execution; callers can durably retain the session. */
 onSession?: (session: AgentSessionReference) => Promise<void>;
 session?: AgentSessionReference; signal: AbortSignal;
 resultContract: 'organizer-decision';
 policy: Readonly<{ readOnly: true; network: false; tools: false }>;
}>;
export type RuntimeTurnResult = Readonly<{ value: unknown; session: AgentSessionReference; durationMs: number }>;
export interface AgentRuntimeAdapter {
 readonly type: AgentRuntimeType;
 getCapabilities(): RuntimeCapabilities;
 // Absence of a session starts one; an existing reference resumes exactly that session.
 runTurn(request: RuntimeTurnRequest): Promise<RuntimeTurnResult>;
 cancel(session: AgentSessionReference): Promise<void>;
}
