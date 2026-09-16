import { WorkspaceEnvironmentRegistry } from '../../application/environment/WorkspaceEnvironmentProvider';
import { WorkspaceEnvironmentService } from '../../application/environment/WorkspaceEnvironmentService';
import { PnpmOfflineProvider } from '../environment/PnpmOfflineProvider';
import { JsonWorkspaceEnvironmentStore } from '../environment/WorkspaceEnvironmentStore';
import { registerWorkspaceEnvironmentIpc } from '../environment/registerWorkspaceEnvironmentIpc';
import { TaskContinuationPreflight } from './TaskContinuationPreflight';
import { OrganizerFollowUp } from '../../application/orchestration/organizer/OrganizerFollowUp';
import { ConditionalRuntimeRetry, retryRuntimeIdentity } from './ConditionalRuntimeRetry';
import { CodexRuntimePreflight } from '../app-server/CodexRuntimePreflight';
import { RunWorkspaces } from './RunWorkspaces';
import { TaskExecutionCoordinator } from '../../application/orchestration/execution/TaskExecutionCoordinator';
import { AgentTaskExecutor } from '../../application/orchestration/execution/AgentTaskExecutor';
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
  app: { getPath(name: 'userData'): string; isPackaged?: boolean }; ipc: Pick<IpcMain, 'handle' | 'removeHandler' | 'on' | 'removeListener'>; trusted: Set<number>;
  projects: Pick<ProjectService, 'getProjects' | 'getGitBranches' | 'getSelectedProjectId'>; conversations: Pick<ConversationStore, 'get'> & Partial<Pick<ConversationStore, 'save'>>;
  agents: Pick<AgentService, 'getAgents'>; teams: Pick<TeamService, 'getTeam'>;
  runtime: Pick<CodexRuntimeStateService, 'snapshot'>; installations: Pick<CodexInstallationService, 'resolve'>;
  projectRoot: string;
}, runtimeSource?: CodexRuntimeSource) {
  const state = () => options.runtime.snapshot();
  const ready = () => { const snapshot = state(); return !snapshot.activity && snapshot.state.operationalStatus === 'READY' && snapshot.state.verificationStatus === 'passed'; };
  const selectedRuntime = runtimeSource ?? new VerifiedOrganizerRuntimeSource(options.installations, async () => ready() ? state().state : null);
  const adapter = new CodexAgentRuntimeAdapter(selectedRuntime, undefined, diagnostic => {
    if (options.app.isPackaged === false) console.debug('[Flux runtime]', diagnostic);
  });
  const router = new AgentRuntimeRouter([adapter]);
  const source = new MainTeamPromptSource(options.projects, options.conversations, options.teams, options.agents, options.app.getPath('userData'));
  const journal = options.conversations.save ? new TeamConversationJournal({ get: id => options.conversations.get(id), save: value => options.conversations.save!(value) }, source, options.agents) : undefined;
  const workspaces = new RunWorkspaces(options.app.getPath('userData'));
  const views = new OrchestrationViews(options.agents, journal, async run => workspaces.retryablePreparation(run, (await source.getProject(run.projectId)).path), (snapshot, task) => {
    try { retryRuntimeIdentity(task, ready() ? state().state : null); return task.dependsOn.every(id => snapshot.state.tasks.find(task => task.id === id)?.status === 'completed'); } catch { return false; }
  });
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
  const conditional = new ConditionalRuntimeRetry(workspaces, async () => ready() ? state().state : null, new CodexRuntimePreflight(selectedRuntime),
    async (id, value) => views.setChecking(await repository.rehydrate(id), value), result => { if (options.app.isPackaged === false) console.debug('[Flux retry preflight]', result); });
  const tasks = new TaskExecutionCoordinator(repository, source, workspaces, new AgentTaskExecutor(router), values, conditional, new TaskContinuationPreflight(workspaces, async () => ready() ? state().state : null, new CodexRuntimePreflight(selectedRuntime), async (id, value) => views.setChecking(await repository.rehydrate(id), value)));
  try { await tasks.recover(); } catch { recovered = false; }
  const followUp = new OrganizerFollowUp(repository, source, router, workspaces, values);
  try { await followUp.recover(); } catch { recovered = false; }
  const service = new OrchestrationService(source, repository, coordinator, views, ready, () => recovered, journal, tasks, followUp);
  const environmentStore = new JsonWorkspaceEnvironmentStore(path.join(options.app.getPath('userData'), 'workspace-environments'));
  await environmentStore.recover();
  const environment = new WorkspaceEnvironmentService(new WorkspaceEnvironmentRegistry([new PnpmOfflineProvider()]), environmentStore, async id => {
    if (!recovered) throw new Error('Environment unavailable');
    const snapshot = await repository.rehydrate(id), run = snapshot.state.run;
    if (service.isRunBusy(id, run.conversationId) || run.status !== 'running' || !snapshot.state.tasks.some(task => task.status === 'needs_attention')
      || snapshot.state.tasks.some(task => task.status === 'working') || snapshot.state.interventions?.some(item => item.status === 'pending')) throw new Error('Environment unavailable');
    const project = await source.getProject(run.projectId), conversation = await source.getConversation(run.conversationId);
    if (conversation.projectId !== run.projectId) throw new Error('Environment unavailable');
    const workspace = await workspaces.verifyReady(run, conversation.branchName, project.path);
    return { runId: id, workspaceId: run.id, directory: workspace.cwd };
  });
  service.environmentBusy = id => environment.busy(id);
  const unregisterEnvironment = registerWorkspaceEnvironmentIpc(options.ipc, environment, options.trusted);
  const unregister = registerOrchestrationIpc(options.ipc, service, options.trusted);
  return { service, shutdown: async () => { unregister(); await unregisterEnvironment(); await service.shutdown(); } };
}
