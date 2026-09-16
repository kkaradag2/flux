# Generic orchestration task contract (schema v2)

## Canonical contracts

`shared/task-status.ts` owns the task lifecycle: planned, ready, working, completed, needs_attention, blocked, failed, cancelled. Domain, shared read model and renderer alias this one type.

The application result carries only completed, needs_attention or blocked plus a bounded summary and evidence. Runtime/process/protocol/sandbox failures remain on the existing failed infrastructure path. Only completed releases dependents. There is no review-specific completion gate, PASS/FAIL interpretation, special Reviewer role, scheduler or automatic Organizer recall.

Organizer plan tasks use key, title, description, ownerAgentId, dependency keys and general acceptance criteria (1–12 strings of at most 500 characters). The application schema, strict Codex envelope and semantic validation agree. Member projection contains IDs, names, descriptions and enabled state; only the Organizer's own instructions are supplied. Persistent instructions of other members remain excluded. Existing agent-authored instructions are retained; they are configuration, not core completion rules. The new builtin Lead template no longer mandates review/test evidence.

Codex task responses retain a flat strict root object, all fields required, additionalProperties=false; evidence may be empty. Semantic validation runs after decoding. Fake Codex and Claude adapters both demonstrate all three results.

## Persistence

Each run remains in the existing app-data orchestration directory. Reader accepts v1 and v2; writer emits only v2. On the first v1 read under the existing per-run lock, migration is validated and atomically written with the existing temporary-file + rename writer. Revision and timestamps do not advance merely for migration. A failed write retains the original bytes. Reading v2 again does not rewrite the file.

Migration removes requiresReview/reviewerAgentId from canonical tasks, renames assigneeAgentId to ownerAgentId, and maps needs_review to needs_attention in task/attempt states and event status/type fields. Titles, descriptions, owners, dependencies, plan order, attempts, sessions, execution reports and event identity/time/order remain. Legacy review fields from event payloads are retained in allowlisted `legacyEventMetadata` at the disk-record boundary; it is excluded from rehydrated domain state/events and renderer DTOs. Subsequent writes retain that metadata.

## Verification

Focused domain, persistence/migration, Organizer decision/executor, team planning/coordinator/main, task execution/retry, runtime preparation, adapter-router, workspace-panel and single-agent suites passed. Typecheck, build and diff whitespace checks passed. Tests use isolated fixtures, including fake Codex/Claude; no real runtime or task retry was used.

Electron restored the real signup plan with Developer Failed (2 attempts), Tester Planned and Reviewer Planned. The Reviewer task title and owner are unchanged. Normalized aggregate hash (tasks, attempt/session data, plans and full canonical events) matched before/after migration; schema changed 1 → 2. Eleven related profile records were retained, including project/team/agent/conversation and saved runtime verification. The routine runtime-health checked-at timestamp may refresh; verified result/version/authentication remained unchanged. Dependency/plan order matched, Retry remained unavailable, and no old status label appeared. Electron remains on that plan screen. The existing runtime-preparation correction is covered by regression tests; no real preflight/model call was run in this phase.

## Remaining boundary

Needs attention and blocked do not yet recall the Organizer. The existing failed Developer validation attempt is still not eligible for Retry: no rule or attempt was reset. The new generic outcomes have been tested with fake adapters, not a real model turn. Package, commit and push were not run.

## Files changed in this phase

- `apps/desktop/src/application/orchestration/TeamPromptCoordinator.ts`
- `apps/desktop/src/application/orchestration/execution/AgentTaskExecutor.ts`
- `apps/desktop/src/application/orchestration/execution/TaskExecutionCoordinator.ts`
- `apps/desktop/src/application/orchestration/organizer/OrganizerDecision.ts`
- `apps/desktop/src/application/orchestration/organizer/OrganizerRuntimeContext.ts`
- `apps/desktop/src/application/orchestration/organizer/buildOrganizerInstruction.ts`
- `apps/desktop/src/application/orchestration/organizer/organizerDecisionSchema.ts`
- `apps/desktop/src/application/orchestration/organizer/validateOrganizerDecision.ts`
- `apps/desktop/src/domain/orchestration/Orchestration.ts`
- `apps/desktop/src/domain/orchestration/OrchestrationError.ts`
- `apps/desktop/src/domain/orchestration/models.ts`
- `apps/desktop/src/domain/orchestration/taskGraph.ts`
- `apps/desktop/src/main/app-server/CodexOrganizerSchema.ts`
- `apps/desktop/src/main/app-server/CodexTaskSchema.ts`
- `apps/desktop/src/main/management/defaults.ts`
- `apps/desktop/src/main/orchestration/JsonOrchestrationRepository.ts`
- `apps/desktop/src/main/orchestration/OrchestrationViews.ts`
- `apps/desktop/src/main/orchestration/TeamConversationJournal.ts`
- `apps/desktop/src/main/orchestration/orchestrationMigration.ts`
- `apps/desktop/src/main/orchestration/orchestrationRecord.ts`
- `apps/desktop/src/renderer/components/tasks/TaskStatusIndicator.tsx`
- `apps/desktop/src/renderer/components/tasks/workspaceTask.ts`
- `apps/desktop/src/renderer/styles.css`
- `apps/desktop/src/shared/orchestration-api.ts`
- `apps/desktop/src/shared/task-status.ts`
- `apps/desktop/tests/agent-runtime-router.test.cjs`
- `apps/desktop/tests/orchestration-domain.test.cjs`
- `apps/desktop/tests/orchestration-main.test.cjs`
- `apps/desktop/tests/orchestration-persistence.test.cjs`
- `apps/desktop/tests/organizer-decision.test.cjs`
- `apps/desktop/tests/organizer-executor.test.cjs`
- `apps/desktop/tests/task-execution.test.cjs`
- `apps/desktop/tests/team-prompt-coordinator.test.cjs`
- `apps/desktop/tests/types/orchestration.typecheck.ts`
- `apps/desktop/tests/workspace-right-panel.test.cjs`
- `docs/architecture/generic-task-contract.md`
- `docs/architecture/task-execution-runtime.md`
- `docs/architecture/task-orchestration-core.md`
