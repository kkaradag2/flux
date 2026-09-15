export type AgentRuntimeType = 'codex' | 'claude';
export type AgentSessionReference = Readonly<{ runtime: AgentRuntimeType; externalSessionId: string }>;
export type RuntimeModelSettings = Readonly<{ model: string | null; reasoningEffort: 'default' | 'low' | 'medium' | 'high' }>;
