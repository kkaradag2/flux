import type { OrganizerDecision } from './OrganizerDecision';
import type { OrganizerRuntimeContext } from './OrganizerRuntimeContext';
import type { AgentRuntimeType, AgentSessionReference, RuntimeModelSettings } from '../../../shared/agent-runtime';
import { AgentRuntimeRouter } from '../../runtime/AgentRuntimeRouter';
import { AgentRuntimeError } from '../../runtime/AgentRuntimeError';
import { buildOrganizerInstruction } from './buildOrganizerInstruction';
import { validateOrganizerDecision } from './validateOrganizerDecision';
import { OrganizerDecisionError } from './OrganizerDecisionError';

export type OrganizerExecutionInput = Readonly<{
 context: OrganizerRuntimeContext;
 instruction: string;
 runtime: AgentRuntimeType;
 settings: RuntimeModelSettings;
 cwd: string;
 session?: AgentSessionReference;
 signal: AbortSignal;
}>;
export type OrganizerExecutionResult = Readonly<{ decision: OrganizerDecision; session: AgentSessionReference; durationMs: number }>;
export class OrganizerDecisionExecutor {
 constructor(private router: AgentRuntimeRouter) {}
 async execute(input: OrganizerExecutionInput): Promise<OrganizerExecutionResult> {
  const context = structuredClone(input.context);
  const result = await this.router.runTurn(input.runtime, { instructions: buildOrganizerInstruction(input.instruction, context), prompt: context.userRequest,
   settings: input.settings, cwd: input.cwd, ...(input.session ? { session: input.session } : {}), signal: input.signal,
   resultContract: 'organizer-decision', policy: { readOnly: true, network: false, tools: false },
  }, ['structuredOutput', 'persistentSessions', 'cancellation', 'workingDirectory', 'sandboxing']);
  try { return { decision: validateOrganizerDecision(result.value, context), session: result.session, durationMs: result.durationMs }; }
  catch (error) { if (error instanceof OrganizerDecisionError) throw new AgentRuntimeError('INVALID_STRUCTURED_RESULT'); throw error; }
 }
}
