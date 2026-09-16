# Single-task execution runtime

## Boundary

`AgentTaskExecutor` accepts an application `TaskExecutionContext`, routes through `AgentRuntimeRouter`, and validates a bounded logical completed/blocked result. Only the owner's saved instructions and model settings are used. Provider schemas, session protocol, sandbox configuration and process handling stay in the Codex adapter. No worker/scheduler is started.

`TaskExecutionCoordinator` selects the first eligible Ready task in current plan order, validates team membership/enabled state, and reserves one run operation. All task changes use the central domain API. Session retention uses `task.set_session`; `task.finish` writes the result and status events atomically. A completed task promotes dependencies centrally; no successor is executed automatically. Results are completed, needs_attention, or blocked; only completed releases dependencies. No review-specific guard exists.

The two new IPC operations accept only `{ runId }`. Existing trusted-main-frame and ownership checks apply. Repeated starts share one operation, cancellation is idempotent, window disposal aborts owned operations, and application shutdown awaits cleanup. Startup recovery marks stale Working tasks failed with EXECUTION_INTERRUPTED without invoking a model.

## Persistence and isolation

Task session/result fields are optional additions to the existing version-1 orchestration record; older records remain valid. The generic session reference is retained before the model turn. Execution summaries are copied into the conversation journal under the finishing event ID, with a per-message agent snapshot. Repeated notifications, unrelated transitions and reloads do not append duplicate summaries.

A version-1 internal `task-workspaces/<runId>.json` record under Electron userData retains the worktree identity. Worktrees live under `worktrees/<projectId>/<runId>`, outside the source repository. The Phase 2C ConversationWorktreeService and GitCommandRunner were reused from this repository's worktree-isolation history, with a structural record interface and preservation option for task execution. No second Git worktree implementation was introduced.

Git commands use execFile/shell:false, fixed option arrays, disabled hooks, and sanitized Git environment. Windows long-path support is scoped to each invocation; Git global configuration is untouched. Created execution worktrees (including partial failures in the final implementation) are retained. Changed files come from actual NUL-delimited Git status, validated as repository-relative paths. Agent-reported file lists are not accepted.

Codex execution uses a persistent session, never approval, workspaceWrite restricted to the single managed cwd, network disabled and both temporary-directory exceptions excluded. Returned thread policy is checked before starting the model. External tools/plugins, web search and delegated agents remain disabled. Unexpected approvals are declined. Raw tool output is not forwarded to the UI. The existing read-only chat/planning policy is unchanged.

## Renderer

The existing planning hook and orchestration subscription also carry task execution state. Plan cards expose Start execution, Stop or Run next task from the safe read model. Only the active task owner is Working. Conversation activity labels distinguish Planning, Plan ready, Running, Waiting for input and Completed. Task summaries and safe changed-file lists are persisted chat messages; run workspace paths and runtime session identifiers stay internal.

## Verification — 2026-09-16

- 208 focused tests passed: task execution, planning/coordinator, domain/persistence, trusted IPC, runtime routing, single-agent and conversation regression suites.
- Typecheck and build passed; final diff check passed.
- Isolated fixture tests cover actual Git worktree reuse, real changed-file detection, unchanged source HEAD/content, and managed paths longer than Windows MAX_PATH without modifying repository configuration.
- One real UI Start execution attempt selected **Implement responsive signup screen**, owned by **Developer**. Preparation failed after **1,431 ms**; task became Failed. No runtime session/model turn was opened and no successor started.
- The assigned runtime was Codex (installed CLI 0.154.0). A reusable execution session was not created by this attempt.
- Intended branch: `flux/a55379cfe01a49b1`. No usable worktree/branch remained after the failed preparation in the first build; its internal failure record was preserved. No worktree was manually deleted during verification.
- Read-only diagnosis found two checkout paths at the Windows 260-character boundary. Invocation-scoped longpaths support and a >260-character fixture test were added afterward. The original Git stderr was deliberately not retained, so this is a diagnosed path-length risk, not proof of the exact original Git failure.
- The real task was **not retried**, as requested. The final implementation also preserves partial worktrees on failure.
- HEAD, complete Git status and source/test/document hashes were identical immediately before/after that real attempt. Actual changed repository-relative files: **none**.
- Failed task status and the Developer's safe failure message were visible in Tasks/chat. The final build is left open on this result, without executing another task.

## Remaining limits

Successful real model execution with writable sandbox still needs a separately authorized attempt. No retry/review UI or scheduler is included. The signup Developer task remains failed; legacy review flags are removed by the schema v2 migration. Generic explicit session continuation is tested, but no runtime session exists for the failed real attempt. Worktree creation and orchestration/conversation files are separate atomic records, not a cross-file transaction; recovery preserves references and does not silently retry.

## Changed application files

- `apps/desktop/src/application/orchestration/execution/AgentTaskExecutor.ts`
- `apps/desktop/src/application/orchestration/execution/TaskExecutionCoordinator.ts`
- `apps/desktop/src/application/runtime/AgentRuntimeAdapter.ts`
- `apps/desktop/src/domain/orchestration/Orchestration.ts`
- `apps/desktop/src/domain/orchestration/events.ts`
- `apps/desktop/src/domain/orchestration/models.ts`
- `apps/desktop/src/main/app-server/CodexAgentRuntimeAdapter.ts`
- `apps/desktop/src/main/app-server/CodexAppServerClient.ts`
- `apps/desktop/src/main/app-server/CodexChatSession.ts`
- `apps/desktop/src/main/app-server/CodexTaskSchema.ts`
- `apps/desktop/src/main/app-server/contracts.ts`
- `apps/desktop/src/main/chat/ConversationRepository.ts`
- `apps/desktop/src/main/chat/ConversationWorktreeService.ts`
- `apps/desktop/src/main/orchestration/OrchestrationBoundaryError.ts`
- `apps/desktop/src/main/orchestration/OrchestrationService.ts`
- `apps/desktop/src/main/orchestration/OrchestrationViews.ts`
- `apps/desktop/src/main/orchestration/RunWorkspaces.ts`
- `apps/desktop/src/main/orchestration/TeamConversationJournal.ts`
- `apps/desktop/src/main/orchestration/composeOrchestration.ts`
- `apps/desktop/src/main/orchestration/orchestrationRecord.ts`
- `apps/desktop/src/main/orchestration/registerOrchestrationIpc.ts`
- `apps/desktop/src/main/projects/GitCommandRunner.ts`
- `apps/desktop/src/main/projects/GitRepositoryService.ts`
- `apps/desktop/src/preload/orchestrationApi.ts`
- `apps/desktop/src/renderer/components/chat/ChatMessageList.tsx`
- `apps/desktop/src/renderer/components/chat/ChatWorkspace.tsx`
- `apps/desktop/src/renderer/components/chat/ExecutionPlanCard.tsx`
- `apps/desktop/src/renderer/hooks/useSingleAgentChat.ts`
- `apps/desktop/src/renderer/hooks/useTeamPlanning.ts`
- `apps/desktop/src/renderer/state/WorkspaceContext.tsx`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/shared/conversation-api.ts`
- `apps/desktop/src/shared/orchestration-api.ts`
- `apps/desktop/src/shared/orchestration-channels.ts`
- `apps/desktop/tests/orchestration-main.test.cjs`
- `apps/desktop/tests/task-execution.test.cjs`
- `apps/desktop/tests/team-planning-ui.test.cjs`
- `docs/architecture/task-execution-runtime.md`
