# Controlled task execution retry

## Application/domain contract

Retry is a separate, explicit `retryTaskExecution({ runId })` action. Main selects the eligible Failed task in plan order; renderer cannot supply a task, agent, path or session. The existing per-run operation map shares concurrent starts/retries and cancellation remains idempotent. Owner/team/enabled and dependency checks are repeated.

Tasks optionally retain ordered typed `attempts` in the existing atomic orchestration snapshot. Old records are loaded without migration and have a derived attempt-1 view. `task.retry` uses the central transition API, preserves the failed report/events, and returns the task to Ready before execution starts a new numbered attempt. Execution stage advances through worktree_preparation, runtime_preparation and model_execution via central commands. Session callbacks persist only a confirmed session; the model-start callback records the stage before submitting the turn.

Only worktree preparation failures, interrupted execution and transient pre-model runtime preparation errors qualify. Security/semantic/protocol validation failures do not. Working, Blocked, Needs review, Completed and Cancelled tasks cannot be retried. Legacy failure eligibility additionally requires no saved session and a verified failed preparation record, with read-only reconciliation. Unknown legacy failures fail closed.

Recovery terminates a stale Working attempt once with EXECUTION_INTERRUPTED; it retains the prior attempts and session, with no automatic retry. `requiresReview` is unchanged and a successful execution would still enter Needs review.

## Worktree reconciliation

ConversationWorktreeService remains the only Git worktree implementation. Under the repository lock it compares the managed record, deterministic branch, Git registrations and filesystem identity before mutation:

- Reuse a valid matching tree.
- Attach a missing tree to a branch only when the durable record proves this run reserved that ref and the saved ref OID still matches.
- Create when neither branch nor tree exists.
- Preserve partial data; reject ambiguous, foreign, symlinked or conflicting identities. No general prune or broad delete.

New locations use the compact userData `w/<runId>` root. Valid saved legacy locations are retained. A missing old profile location can be re-prepared under the compact root only after proving no directory, branch or registration exists at the old identity; nothing is moved/deleted. All other location mismatches stop execution. The legacy managed root is canonicalized before selection, including Windows redirected app-data locations.

The internal version-1 task-workspace record retains creating/ready/failed status, branch ownership/OID and any replaced empty location. It is atomically written and is never exposed to renderer. Windows longpaths is invocation-scoped; shell:false and existing Git environment restrictions remain. Global/system/repository configuration is untouched.

## UI and history

Eligible failures show the safe message, previous attempt number and Retry execution. Active execution shows Stop and the task owner Working. Permanent failures have no Retry action. The same orchestration subscription drives restoration and activity.

Older task-result messages are retained on disk with `superseded: true` when a new attempt result is saved. Chat renders the latest result only. Domain failure events and every attempt's safe report remain intact.

## Verification — 2026-09-16

- 214-test focused regression command passed; afterward the execution suite passed all 24 tests, including an additional retry-recovery test (215 distinct tests across the selected suites).
- Typecheck, build and git diff --check passed.
- Fixtures cover duplicate Retry, ownership/dependencies, permitted/permanent failure categories, cancellation, recovery idempotency, session persistence, real branch-only reconciliation/reuse, unknown-path preservation, empty legacy profile relocation, long paths, unchanged Git configuration, and Retry UI payload/visibility.

### Single authorized real attempt

- The preflight initially kept Retry hidden because of legacy app-data path resolution. No retry/model invocation occurred during that UI preflight. Canonicalization and strictly empty-location reconciliation were fixed and tested before the one actual click.
- UI Retry execution then started **attempt 2** for **Implement responsive signup screen / Developer**.
- Worktree preparation succeeded: **ready**, branch `flux/a55379cfe01a49b1`. The worktree is retained and Git-clean.
- Runtime: **Codex CLI 0.154.0**. Duration: **9,105 ms**.
- Final status: **Failed**. Safe category: **VALIDATION_FAILED**. Stage: **runtime_preparation**.
- No model turn was submitted, and no verified session reference was saved. The precise rejected protocol/policy condition was not retained; no raw provider output is included in the report.
- Two Failed events and both attempts remain on disk. Chat shows one current Developer result, with the old failure retained but superseded. Retry is hidden for this validation failure.
- Tester and Reviewer stayed Planned and were never started. No second real retry was performed.
- Actual changed repo-relative worktree files: **none**.
- Immediately before/after the call, main HEAD, full Git status, source/test/document hashes and local/global/system/effective Git config digests matched.
- Electron remains open on the result. No package, commit or push.

## Open points

The runtime preparation validation failure still needs diagnosis before real writable-model execution can be verified. No session reuse or Needs review transition could be demonstrated with this real attempt; those paths are covered by injected-runtime tests. No scheduler, review execution or plan revision was added.

## Files touched in this retry step

Paths below are relative to `apps/desktop/src` unless stated otherwise. Earlier uncommitted execution changes are preserved.

- `application/orchestration/execution/AgentTaskExecutor.ts`
- `application/orchestration/execution/TaskExecutionCoordinator.ts`
- `application/runtime/AgentRuntimeAdapter.ts`
- `domain/orchestration/Orchestration.ts`, `events.ts`, `models.ts`, new `taskAttempts.ts`
- `main/app-server/CodexAgentRuntimeAdapter.ts`, `CodexChatSession.ts`
- `main/chat/ConversationRepository.ts`, `ConversationWorktreeService.ts`
- `main/orchestration/RunWorkspaces.ts`, `OrchestrationBoundaryError.ts`, `OrchestrationService.ts`, `OrchestrationViews.ts`, `TeamConversationJournal.ts`, `composeOrchestration.ts`, `orchestrationRecord.ts`, `registerOrchestrationIpc.ts`
- `preload/orchestrationApi.ts`
- `shared/conversation-api.ts`, `orchestration-api.ts`, `orchestration-channels.ts`
- `renderer/components/chat/ChatMessageList.tsx`, `ChatWorkspace.tsx`, `ExecutionPlanCard.tsx`
- `renderer/hooks/useSingleAgentChat.ts`, `useTeamPlanning.ts`
- `renderer/state/WorkspaceContext.tsx`
- `apps/desktop/tests/task-execution.test.cjs`, `team-planning-ui.test.cjs`, `orchestration-main.test.cjs`
- `docs/architecture/task-execution-retry.md`

## Conditional runtime-preparation retry

A VALIDATION_FAILED attempt is not generally retryable. The main-process ConditionalRuntimeRetry gate accepts only a failed runtime-preparation attempt with no saved session or model start. It verifies the enabled team owner, completed dependencies, exclusive run operation, existing owned clean worktree, and unchanged verified runtime before an actual no-turn sandbox preflight. Legacy attempts have no runtime snapshot: the retained 0.154.0 verification must predate the failed attempt; a later re-verification fails closed.

The gate writes no task/attempt/session state. Following preflight, source ownership and the entire aggregate are rechecked. Retry and Working transitions commit together in one repository update. Runtime source/version identity is carried through a provider-neutral application contract and rechecked by the main adapter before process launch. Failed checks or cancellation leave the previous attempts untouched. Checking is transient main state, available on view reload, with a Stop action. Successful execution uses the existing early session save and generic result pipeline; dependent tasks may become Ready but are never scheduled.
