# Task runtime preparation diagnosis — Codex 0.154.0

## Proven failure

The existing failed attempt stopped in `runtime_preparation`, before the model-start callback or a saved task session. The historical error was `PROTOCOL_ERROR`, projected as `VALIDATION_FAILED`.

A prompts-free, ephemeral `thread/start` using the existing ready worktree and saved Developer settings reproduced the failure. The returned CWD matched the requested CWD. Approval was `never`, sandbox was `workspaceWrite`, network was disabled, and both temporary-directory exclusions were enabled. Only the old `writableRoots.length === 1` assertion failed: the returned list was empty.

The diagnostic boundary is **returned thread policy / writableRoots** (`thread_policy_mismatch` in the old expectation). This was a Flux validation assumption, not a rejected `thread/start` request.

In Codex 0.154.0, workspace-write's CWD is implicit. The compatibility policy reports *additional* writable roots and removes CWD from that array. See the pinned [official implementation](https://github.com/openai/codex/blob/rust-v0.154.0/codex-rs/sandboxing/src/manager.rs#L657-L697). The locally generated `ThreadStartParams`, `ThreadStartResponse`, and `SandboxPolicy` were inspected; the minimal request/policy types were additionally checked by TypeScript assignment against the generated types. Generated protocol files remain outside committed source.

## Minimal correction and diagnostics

`verifyTaskThreadPolicy` verifies returned CWD identity and every restrictive policy flag. It accepts no additional roots, or a redundant explicit CWD entry; any other writable root is rejected. It does not grant writes beyond the managed worktree. The thread and turn requests retain their previous restrictions. Organizer and ordinary chat remain read-only.

`RuntimePreparation` provides fixed internal subcodes and allowlisted logical field names. `CodexAgentRuntimeAdapter` reports missing installation, capability and verified-version failures distinctly. RPC rejection retains only its numeric code. Development composition emits only the typed diagnostic; renderer errors remain generic. No provider messages, paths, instructions, session identifiers or process output are attached.

`CodexChatSession.preflight` reuses normal preparation, uses an ephemeral thread, skips both session-save and model-start callbacks, returns before `turn/start`, and closes the transport. `CodexRuntimePreflight` adds a main-only, bounded diagnostic entry point with managed-directory identity validation. It has no IPC, repository, task, attempt or session-save port. Its inputs must come from trusted main-process records; no renderer endpoint was added.

## Real non-mutating verification

Using the saved installation, Developer configuration and ready worktree:

| Stage | Result |
| --- | --- |
| Runtime source resolved | Passed (0.154.0) |
| Worktree identity verified | Passed |
| CWD accepted | Passed |
| Sandbox request accepted | Passed |
| Thread started | Passed, ephemeral, no prompt |
| Returned policy verified | Passed |
| Cleanup completed | Passed |

The transport was instrumented to reject any turn method. Observed turn calls: **0**. Child exit, empty pending requests/subscription sets and removed stdout listener were verified. Run/task/attempt/session and related saved settings hashes were unchanged. Worktree file hashes and Git status were unchanged. The source checkout's HEAD, status, source/test/document hashes and Git configuration digests matched immediately before and after preflight. Intentional source changes for this fix are separate from that preflight comparison.

Focused preparation, task-execution, runtime-router, Organizer, ordinary-chat and orchestration-main tests passed. Typecheck, build, generated-contract compatibility and `git diff --check` passed. No package, model call, Retry, commit or push was performed. No Electron UI interaction was required.

## Remaining boundary

Preparation is now verified for a future explicitly authorized execution. This does **not** prove a model turn or sandboxed tool execution will succeed. The existing failed attempt, its permanent validation classification and the current Retry eligibility rule remain unchanged. No automatic retry or status migration is performed.

## Files changed in this diagnosis

- `apps/desktop/src/main/app-server/RuntimePreparation.ts`
- `apps/desktop/src/main/app-server/CodexRuntimePreflight.ts`
- `apps/desktop/src/main/app-server/AppServerDiagnostic.ts`
- `apps/desktop/src/main/app-server/CodexChatSession.ts`
- `apps/desktop/src/main/app-server/CodexAgentRuntimeAdapter.ts`
- `apps/desktop/src/main/orchestration/composeOrchestration.ts`
- `apps/desktop/tests/runtime-preparation.test.cjs`
- `apps/desktop/tests/task-execution.test.cjs` (thread response fixture includes generated-contract CWD)
- `docs/architecture/task-runtime-preparation.md`

Existing execution/retry changes were retained. All diagnostic scripts and generated-contract checks remain in ignored `.cache` files.
