# Workspace Organizer planning

## Routing and persistence

New workspace team requests create a persisted `mode: team` conversation on the first send. Legacy conversations without that mode retain the single-agent route. `TeamConversationJournal` stores user messages before execution and visible Organizer replies through `ConversationRepository`. Deterministic reply IDs make repeated publication and final synchronization idempotent.

`respond` completes planning without tasks. `ask_user` leaves the run waiting for input. A follow-up resumes the same Organizer session and run; completed or interrupted planning-only runs can explicitly resume through the central domain command. A run with a plan cannot accept plan revisions in this phase.

Visible replies are saved before the final orchestration snapshot. Conversation and orchestration records remain separate atomic JSON files, not a cross-file transaction. Recovery can therefore report interrupted planning after a crash between those writes; a plan card is rendered only when the persisted orchestration plan exists.

## Main/renderer boundary

The main-process composition resolves projects, teams, Organizer definitions and runtime sessions. IPC exposes narrow conversation creation, planning, continuation, cancellation and safe read-model operations. The renderer receives no Organizer instructions, internal runtime session IDs or raw provider output.

`useTeamPlanning` owns the subscription, conversation loading, stale-result guards and planning activity. Workspace state retains the existing team selection. Persisted messages replace renderer state rather than being appended on every notification. The plan card and right-hand Tasks panel consume the same ordered read model; existing manual tab preferences remain in effect.

Cancellation uses the main operation's AbortController, is idempotent, and does not override an already completed result. Only the Organizer is Working during planning. Single-agent cancellation keeps its existing path.

## Verification (2026-09-16)

- Focused regression run: 173 tests passed. After the explicit same-session follow-up adjustment, the 102 affected domain/coordinator/main/UI tests passed again.
- Typecheck, build and `git diff --check` passed. No package, commit or push.
- One real UI request using Codex CLI 0.154.0 produced `create_plan` in 30,404 ms.
- Tasks: implement the responsive signup screen (Developer, Ready); verify behavior and layout (Tester, Planned, one dependency); review implementation and evidence (Reviewer, Planned, two dependencies).
- Planning activity and the Stop action appeared; all agents returned to Idle. Real active cancellation was not invoked in this single model call; abort, idempotency and completion races were tested with the injected runtime.
- Electron restart restored identical conversation messages, plan and task content. The latest build was reopened and left on that result.
- Real-call Git HEAD, status and source diff were unchanged. Profile migration preserved project, agent, team, installation and prior conversation records. Runtime content was preserved except for its refresh timestamp.

## Files changed in this integration

Paths below are relative to `apps/desktop/src/` unless stated otherwise. Earlier uncommitted orchestration work is retained separately.

- Domain/application: `domain/orchestration/models.ts`, `domain/orchestration/Orchestration.ts`, `application/orchestration/TeamPromptCoordinator.ts`.
- Main persistence/routing: `main/chat/ConversationRepository.ts`, `main/chat/SingleAgentRunService.ts`, new `main/orchestration/TeamConversationJournal.ts`, `main/orchestration/composeOrchestration.ts`, `main/orchestration/OrchestrationService.ts`, `main/orchestration/OrchestrationViews.ts`, `main/orchestration/registerOrchestrationIpc.ts`.
- Contracts/preload: `shared/conversation-api.ts`, `shared/orchestration-api.ts`, `shared/orchestration-channels.ts`, `preload/orchestrationApi.ts`.
- Renderer: new `renderer/hooks/useTeamPlanning.ts`, new `renderer/components/chat/ExecutionPlanCard.tsx`, `renderer/state/WorkspaceContext.tsx`, `renderer/hooks/useConversationHistory.ts`, `renderer/hooks/useSingleAgentChat.ts`, `renderer/components/WorkspaceScreen.tsx`, `renderer/components/chat/ChatWorkspace.tsx`, `renderer/components/chat/ChatMessageList.tsx`, `renderer/components/avatars/AgentAvatar.tsx`, `renderer/components/tasks/TaskRow.tsx`, `renderer/styles.css`.
- Tests: `apps/desktop/tests/orchestration-main.test.cjs`, `apps/desktop/tests/team-prompt-coordinator.test.cjs`, new `apps/desktop/tests/team-planning-ui.test.cjs`.
- Documentation: this file.

Task execution, scheduler, review execution, mentions, plan revision and a Claude adapter remain outside this phase. A created plan leaves the domain run active awaiting future execution; it does not start task agents.
