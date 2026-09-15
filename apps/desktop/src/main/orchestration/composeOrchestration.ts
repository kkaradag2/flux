import { TeamConversationJournal } from './TeamConversationJournal';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { IpcMain } from 'electron';
import { AgentRuntimeRouter } from '../../application/runtime/AgentRuntimeRouter';
import { OrganizerDecisionExecutor } from '../../application/orchestration/organizer/OrganizerDecisionExecutor';
import { TeamPromptCoordinator } from '../../application/orchestration/TeamPromptCoordinator';
import { recoverPlanningRuns } from '../../application/orchestration/recoverPlanningRuns';
import { CodexAgentRuntimeAdapter, type CodexRuntimeSource } from '../app-server/CodexAgentRuntimeAdapter';
import { VerifiedOrganizerRuntimeSource } from '../app-server/VerifiedOrganizerRuntimeSource';
import type { CodexInstallationService } from '../runtime/CodexInstallationService';
import type { CodexRuntimeStateService } from '../runtime/CodexRuntimeStateService';
import type { AgentService } from '../management/AgentService';
import type { TeamService } from '../management/TeamService';
import type { ProjectService } from '../projects/ProjectService';
import type { ConversationStore } from '../chat/ConversationRepository';
import { createOrchestrationRepository } from './createOrchestrationRepository';
import { MainTeamPromptSource } from './MainTeamPromptSource';
import { OrchestrationViews } from './OrchestrationViews';
import { ObservedOrchestrationRepository } from './ObservedOrchestrationRepository';
import { OrchestrationService } from './OrchestrationService';
import { registerOrchestrationIpc } from './registerOrchestrationIpc';

export async function composeOrchestration(options: {
  app: { getPath(name: 'userData'): string }; ipc: Pick<IpcMain, 'handle' | 'removeHandler' | 'on' | 'removeListener'>; trusted: Set<number>;
  projects: Pick<ProjectService, 'getProjects' | 'getGitBranches' | 'getSelectedProjectId'>; conversations: Pick<ConversationStore, 'get'> & Partial<Pick<ConversationStore, 'save'>>;
  agents: Pick<AgentService, 'getAgents'>; teams: Pick<TeamService, 'getTeam'>;
  runtime: Pick<CodexRuntimeStateService, 'snapshot'>; installations: Pick<CodexInstallationService, 'resolve'>;
  projectRoot: string;
}, runtimeSource?: CodexRuntimeSource) {
  const state = () => options.runtime.snapshot();
  const ready = () => { const snapshot = state(); return !snapshot.activity && snapshot.state.operationalStatus === 'READY' && snapshot.state.verificationStatus === 'passed'; };
  const adapter = new CodexAgentRuntimeAdapter(runtimeSource ?? new VerifiedOrganizerRuntimeSource(options.installations, async () => ready() ? state().state : null));
  const router = new AgentRuntimeRouter([adapter]);
  const source = new MainTeamPromptSource(options.projects, options.conversations, options.teams, options.agents, options.app.getPath('userData'));
  const journal = options.conversations.save ? new TeamConversationJournal({ get: id => options.conversations.get(id), save: value => options.conversations.save!(value) }, source, options.agents) : undefined;
  const views = new OrchestrationViews(options.agents, journal);
  const paths = (await options.projects.getProjects()).map(project => project.path);
  const repository = new ObservedOrchestrationRepository(createOrchestrationRepository(options.app,
    [options.projectRoot, ...paths, path.join(options.app.getPath('userData'), 'worktrees')]), async snapshot => { await journal?.sync(snapshot); await views.publish(snapshot); });
  const values = { newId: randomUUID, now: () => new Date().toISOString() };
  let recovered = true;
  try { await recoverPlanningRuns(repository, values); }
  catch { recovered = false; } // Fail this module closed; existing project/chat/management screens still open.
  const executor = new OrganizerDecisionExecutor(router);
  const durableExecutor: Pick<OrganizerDecisionExecutor, 'execute' | 'assertSupported'> = {
    assertSupported: runtime => executor.assertSupported(runtime),
    execute: async input => {
      const result = await executor.execute(input);
      if (journal && !input.signal.aborted) {
        const active = await repository.getActiveRun(input.context.conversationId);
        if (active) await journal.sync(active, { type: result.decision.type === 'create_plan' ? 'plan_created' : result.decision.type,
          message: result.decision.message, ...(result.decision.type === 'ask_user' ? { questions: result.decision.questions } : {}) });
      }
      return result;
    },
  };
  const coordinator = new TeamPromptCoordinator(source, repository, durableExecutor, values);
  const service = new OrchestrationService(source, repository, coordinator, views, ready, () => recovered, journal);
  const unregister = registerOrchestrationIpc(options.ipc, service, options.trusted);
  return { service, shutdown: async () => { unregister(); await service.shutdown(); } };
}
