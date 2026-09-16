# Offline workspace environment — 2026-09-16

Branch: `feature/organizer-task-followup`. Provider-based preparation was added without a dependency, model call, task transition, scheduler, or plan revision. Existing changes and the protected run worktree were preserved. No commit, push, merge or package command was run.

## Architecture and controls

Application contracts define `WorkspaceEnvironmentProvider`, `WorkspaceEnvironmentRegistry`, `WorkspaceEnvironmentPlan`, `WorkspaceEnvironmentPreparationResult`, and a separate preparation service/store. Core orchestration has no package-manager commands or technology-specific detection. The concrete provider, process runner, filesystem validation and JSON store live in main infrastructure.

Main resolves the run, registered project, saved conversation branch and verified managed worktree. IPC accepts only `{ runId }`, rejects extra fields and untrusted frames, and exposes get-status, prepare and cancel. Renderer cannot select paths, commands, environment, executable or provider. Environment work reserves the run against execution and Organizer operations; duplicate preparations share one operation. Cancellation is idempotent and shutdown awaits process close/stdio cleanup.

The independent app-data record contains run/workspace identities, provider ID/contract version, lockfile fingerprint, state, safe code and timestamps. It contains no paths, environment or process output. Ready reuse checks the fingerprint, provider contract and readiness marker; changed inputs invalidate it. Startup converts stale preparing records to failed once, without restarting work. Task and conversation repositories are read-only in this flow.

## Provider detection and install contract

Selected provider: **pnpm-offline**, contract **1**, verified installed CLI **9.15.9**. Detection verified the current Flux root package identity and pinned packageManager, pnpm lockfile, exact supported workspace layout and repository configuration, and the installed CLI version. The Corepack download shim is not executed. Unknown repository configuration, unsupported versions and unsafe links fail closed.

Lockfile SHA-256: `28d3f66a6f35088ddccc35b91bd7a1040bbdaa857c4e471cbc41cc2a2d198f57`.

Options were verified from the installed CLI's `help install` output. Its local source also confirms that offline tarball fetching throws before downloading. The install contract uses separate argv with `shell: false`:

`install --offline --frozen-lockfile --ignore-scripts --ignore-pnpmfile --package-import-method copy --reporter silent --side-effects-cache-readonly --store-dir <private worktree store>`

The provider supports the **store configured inside the managed worktree** (`.pnpm-store`) in this first version. It does not search global caches or fall back to the main checkout's cache. If present, this store is checked for links and copied into a unique ignored worktree scratch directory before installation, preserving the source store. Package imports use copy rather than shared hardlinks. Main-checkout node_modules is never linked or copied. All package-manager state/home/cache/temp settings are isolated to the worktree; inherited package/proxy/auth/Node configuration is not passed through. The read-only version probe uses the existing worktree as its temporary-directory reference without creating preparation directories.

Lifecycle scripts and pnpm hooks are disabled. There is no online fallback or arbitrary shell command. Source/config hashes are checked around installation and unexpected tracked/nonignored file changes fail preparation. Raw process output remains internal and maps only to allowlisted result codes.

## One real Electron action

After tests, typecheck, build and diff check passed, **Prepare workspace was clicked exactly once** on the existing attention run. The UI showed Preparing workspace, a spinner and Cancel; unrelated execution controls were disabled during preparation.

| Observation | Result |
| --- | --- |
| Provider | pnpm offline |
| Environment state | **failed** |
| Safe result | **offline_dependencies_unavailable** |
| Recorded preparing-to-terminal duration | **11 ms**, excluding detection/UI roundtrip |
| Cause | Configured worktree-local store does not exist |
| Install processes | **0**; availability check stopped before install |
| Network / lifecycle scripts | Neither used |
| Model calls / new task attempts | **0 / 0** |
| Developer | needs_attention, attempt 4 unchanged |
| Tester / Reviewer | planned, zero attempts unchanged |

There was no second preparation, online fallback or Developer continuation. Since preparation failed, the success-only worktree signup tests/typecheck/build/diff verification sequence was **not run**. No new verification success is claimed for that worktree. It remains **not ready for Developer continuation** because required local dependencies are unavailable through this provider's configured store.

## Before/after evidence

Main HEAD/status and all tracked/nonignored source hashes were identical across the action. Main HEAD stayed `4d3eb991783924f37f2b62898e3a37daa83ec827`. Worktree HEAD/status/hashes were identical; its HEAD stayed `fa619bf4075d2c04518b89c8f61374db13798ed0`. Git configuration and the checked project/user/global package-manager configuration hashes were identical. Lockfile and package manifests were unchanged.

All eight task files were preserved byte-for-byte:

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/components/settings/SettingsScreen.tsx`
- `apps/desktop/src/renderer/components/signup/SignupScreen.tsx`
- `apps/desktop/src/renderer/components/signup/signup.css`
- `apps/desktop/src/renderer/components/signup/signupValidation.ts`
- `apps/desktop/src/renderer/state/NavigationContext.tsx`
- `apps/desktop/tests/signup.test.cjs`
- `docs/verification/signup.md`

The complete run/task/session/attempt/intervention record, workspace record and conversation messages were identical. The separate environment failure record is the only new application-data result. Local proof files are `.cache/environment-detection-proof.json`, `.cache/environment-before.json`, `.cache/environment-after.json` and `.cache/environment-result-proof.json`; private local references are kept out of this report. This report was intentionally written after the main-checkout comparison.

Electron was also closed and reopened. The persisted environment failure returned without another preparation, with run/conversation/worktree/workspace/config comparisons unchanged. The only main-checkout difference after the action was this report. Restoration proof is `.cache/environment-restoration-proof.json`. Electron was left open on the environment result.

## Verification and changed application files

- Focused environment/UI/IPC checks: **67/67 passed**.
- Final full regression after the read-only probe fix: **448/448 passed**.
- `pnpm typecheck`, `pnpm build`, `git diff --check`: passed.
- Covered provider boundaries/detection, fixed offline command and safe environment, absent cache, unsafe links, duplicate/cancel/window shutdown, persistent recovery idempotency, fingerprint invalidation, safe error projection, renderer explicit action/spinner/cancel, and existing Organizer/execution/continuation regressions.

Changed/new application files (relative to `apps/desktop/`):

- `src/application/environment/WorkspaceEnvironmentProvider.ts`
- `src/application/environment/WorkspaceEnvironmentService.ts`
- `src/main/environment/EnvironmentProcess.ts`
- `src/main/environment/PnpmOfflineProvider.ts`
- `src/main/environment/WorkspaceEnvironmentStore.ts`
- `src/main/environment/registerWorkspaceEnvironmentIpc.ts`
- `src/main/orchestration/OrchestrationService.ts`
- `src/main/orchestration/composeOrchestration.ts`
- `src/preload/orchestrationApi.ts`
- `src/shared/workspace-environment.ts`
- `src/shared/orchestration-api.ts`
- `src/renderer/components/chat/ExecutionPlanCard.tsx`
- `src/renderer/components/chat/WorkspaceEnvironmentPanel.tsx`
- `src/renderer/styles.css`
- `tests/workspace-environment.test.cjs`
- `tests/orchestration-main.test.cjs`
- `tests/team-planning-ui.test.cjs`

This report is also new. Existing earlier Organizer and continuation changes remain uncommitted. Open limitation: this initial provider accepts only the pinned Flux layout and its configured worktree-local store; a read-only external-store selection policy is not implemented. Successful dependency installation and subsequent worktree validation were not exercised by the authorized real action because that store was absent.
