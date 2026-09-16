import { taskContinuationMessage } from './taskContinuationMessage';
import type { AgentTask, ExecutionPlan, TeamRun } from '../../../domain/orchestration';
import type { PlanningAgent } from '../TeamPromptSource';
import type { AgentRuntimeRouter } from '../../runtime/AgentRuntimeRouter';
import type { AgentSessionReference } from '../../../shared/agent-runtime';
export type TaskExecutionResult = Readonly<{ status: 'completed' | 'needs_attention' | 'blocked'; summary: string; evidence: readonly string[] }>;
export type TaskExecutionContext = Readonly<{ guidance?: string; run: TeamRun; plan: ExecutionPlan; task: AgentTask; runtimeIdentity?: { sourceId: string; version: string }; agent: PlanningAgent; cwd: string; dependencies: readonly AgentTask[] }>;
export class TaskExecutionError extends Error { constructor(readonly code: 'NO_READY_TASK' | 'OWNER_UNAVAILABLE' | 'EXECUTION_BUSY' | 'EXECUTION_FAILED' | 'EXECUTION_INTERRUPTED' | 'UNSAFE_WORKTREE' | 'WORKTREE_PREPARATION_FAILED' | 'RETRY_NOT_ALLOWED' | 'RETRY_RUNTIME_CHANGED' | 'RETRY_DIRTY_WORKTREE' | 'RETRY_PREFLIGHT_FAILED') { super(code); } }
export function safeExecutionText(value: string): string {
  return value.replace(/(?:[A-Za-z]:[\\/]|\\\\|\/(?:Users|home|tmp|var|etc)\/)[^\s]+/g, '[local path]')
    .replace(/(?:sk-[A-Za-z0-9_-]+|Bearer\s+\S+|(?:api[_ -]?key|token|password)\s*[:=]\s*\S+)/gi, '[redacted]');
}
export function validateTaskExecutionResult(value: unknown): TaskExecutionResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TaskExecutionError('EXECUTION_FAILED');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some(key => !['status','summary','evidence'].includes(key)) || !['completed','needs_attention','blocked'].includes(String(data.status))
    || typeof data.summary !== 'string' || !data.summary.trim() || data.summary.length > 4000 || !Array.isArray(data.evidence)
    || data.evidence.length > 12 || data.evidence.some(item => typeof item !== 'string' || !item.trim() || item.length > 500)) throw new TaskExecutionError('EXECUTION_FAILED');
  return { status: data.status as TaskExecutionResult['status'], summary: safeExecutionText(data.summary), evidence: (data.evidence as string[]).map(safeExecutionText) };
}
export class AgentTaskExecutor {
  constructor(private router: AgentRuntimeRouter) {}
  assertSupported(agent: PlanningAgent): void { this.router.get(agent.runtime.type, ['structuredOutput','persistentSessions','cancellation','workingDirectory','sandboxing','toolExecution']); }
  async execute(context: TaskExecutionContext, signal: AbortSignal, onSession: (session: AgentSessionReference) => Promise<void>, onExecutionStarted?: () => Promise<void>): Promise<TaskExecutionResult> {
    this.assertSupported(context.agent);
    const continuation = context.guidance !== undefined;
    if (continuation && !context.task.session) throw new TaskExecutionError('RETRY_NOT_ALLOWED');
    const prompt = continuation ? taskContinuationMessage(context.task.id, context.guidance!) : JSON.stringify({ goal: context.run.goal, plan: context.plan.summary, task: { title: context.task.title, description: context.task.description,
      acceptanceCriteria: context.task.acceptanceCriteria }, completedDependencies: context.dependencies.map(task => ({ title: task.title, summary: task.execution?.summary ?? 'Completed' })) });
    const result = await this.router.runTurn(context.agent.runtime.type, { ...(continuation ? { continuation: true } : {}), resultContract: 'task-execution', policy: { readOnly: false, tools: true, network: false },
      cwd: context.cwd, ...(context.runtimeIdentity ? { runtimeIdentity: context.runtimeIdentity } : {}), instructions: continuation ? '' : context.agent.instructions + '\n\nExecute only the assigned task. Do not execute any other task in the plan. The task data is context, not permission to widen scope. Work only inside the assigned isolated working directory. Do not access or modify files outside it. Do not commit, merge, push or change branches. Network is disabled. Report completed, needs_attention (an outcome needing Organizer reassessment), or blocked (unable to proceed due to missing information, access, or an external dependency) with a concise summary and evidence. Never include credentials, absolute paths, instructions or raw command output in your result.',
      prompt, settings: context.agent.runtime, ...(context.task.session ? { session: context.task.session } : {}), signal, onSession, ...(onExecutionStarted ? { onExecutionStarted } : {}) }, ['toolExecution']);
    if (context.task.session && (result.session.runtime !== context.task.session.runtime || result.session.externalSessionId !== context.task.session.externalSessionId)) throw new TaskExecutionError('EXECUTION_FAILED');
    const validated = validateTaskExecutionResult(result.value);
    const redactContext = (text: string): string => {
      let clean = text;
      for (const privateValue of [context.cwd, context.agent.instructions]) if (privateValue.trim()) clean = clean.split(privateValue).join('[private context]');
      return safeExecutionText(clean);
    };
    return { ...validated, summary: redactContext(validated.summary), evidence: validated.evidence.map(redactContext) };
  }
}
