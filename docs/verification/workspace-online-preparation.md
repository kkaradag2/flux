# Confirmed online workspace preparation — 2026-09-16

Branch: `feature/organizer-task-followup`. Exactly one real online preparation was authorized through Electron's **Download workspace dependencies?** modal and its **Download dependencies** button. Installation succeeded. No second download, model call, task continuation, Organizer call, Tester/Reviewer execution, commit, push, merge or package operation was performed.

## Result

| Item | Observed result |
| --- | --- |
| Provider | pnpm; existing provider ID `pnpm-offline`, contract version **2** |
| Plan / stored mode | `online_with_confirmation` / `online` |
| Installed CLI | **pnpm 9.15.9** |
| Registry hostname shown in modal | **registry.npmjs.org** |
| Consent timestamp | 2026-09-16T08:27:03.284Z |
| Download/preparation duration | **115,533 ms** |
| Installation | **ready** |
| Signup focused tests | **passed** |
| Typecheck | **passed** |
| Build | **passed** |
| Git diff whitespace check | **passed** |
| Source files | Preserved; no new tracked or nonignored files |
| Developer | Still **needs_attention**, attempt **4** |
| Tester / Reviewer | Still **planned**, zero attempts |

The dependency environment and requested source checks are ready for subsequent work. This does not complete the Developer task or create a fresh continuation decision. The existing task/session/intervention history and previous chat messages remain unchanged; no workflow step was automatically advanced.

## Consent and network boundary

The main process generates an owner-bound, opaque, single-use consent token with a five-minute expiry. It is scoped to run, verified managed worktree identity, lockfile fingerprint, provider version, repository configuration fingerprint and validated registry. The scope is rechecked before starting the process. Cancel consumes the token without downloading; a consumed or expired token cannot start another operation. Only the consent timestamp and safe scope metadata are persisted, not a reusable permission.

Renderer inputs are limited to run ID and, for confirmation/cancellation, the opaque consent ID. Registry, executable, arguments, environment, store and paths cannot be supplied by the renderer. Offline failure can reveal the online action but never invokes it automatically.

The initial registry policy supports the pinned public npm registry only. HTTPS is mandatory; credentials, query/hash, custom paths/ports, HTTP, file URLs, localhost, loopback and alternate hosts are rejected. The existing lockfile's pinned Electron source archive is the supported HTTPS tarball exception. Registry resolution comes from the verified pnpm default and the checked Flux configuration; no user credential is read, collected, logged or forwarded. Authentication failures stop with `authentication_required`.

Network use was limited to the dependency preparation process. Codex, Organizer, continuation and Electron renderer policies were not broadened. No browser/model network permission was granted. Subsequent source validation invoked local repository tools without another package installation.

## Verified preparation contract

The installed CLI's `help install` and local implementation verified the supported flags, registry default and progress-event contract. Commands use a resolved executable and separate argv with `shell: false`, CWD fixed to the managed worktree. The online install uses:

`install --frozen-lockfile --ignore-scripts --ignore-pnpmfile --package-import-method copy --reporter ndjson --side-effects-cache-readonly --verify-store-integrity --network-concurrency 4 --registry <main-validated registry> --store-dir <managed worktree store>`

Lifecycle scripts and pnpm hooks stayed disabled. The managed store and package-manager state are isolated under ignored worktree directories, without changing global/project configuration. Dependencies were not copied from or linked to the main checkout. The store is not treated as trusted executable/source content; pnpm integrity checking remains enabled. Copy import avoids mutable hardlinks to shared store content. Observed `node_modules` was not a symlink/junction; sampled TypeScript and React files each had link count **1**.

Progress contains only fixed stages and elapsed time, never fabricated percentages or raw package output. Native pnpm stage events drive the linking stage; post-process checks drive lockfile verification. Main exposes only allowlisted errors. Process cancellation terminates the process tree; window/app cleanup awaits termination. Registry credentials, full URLs, process output, environment and absolute paths are absent from DTOs and preparation records.

## Source validation and preservation

The saved worktree has an older typecheck script with two TypeScript configurations. The first automatic validation correctly refused its initially unsupported script shape and recorded `not_run`. The resolver was then extended and tested to parse only the supported `tsc --noEmit -p <known config>` sequence into argv. **Verify workspace** ran the required checks through Electron main without reinstalling anything. All four checks passed. Installation and source-validation results are separate in persistence and UI.

Resolved commands were the existing signup Node test, the worktree's node and renderer TypeScript configurations, its `node scripts/build.mjs` build, and `git diff --check`. No arbitrary shell script string was executed. Source snapshots were compared after each check, with immediate stop on unexpected tracked/nonignored changes. Normal ignored build outputs were allowed. No task source fix was made.

Before/after installation comparisons showed identical main checkout HEAD/status/source hashes, worktree HEAD/status/source hashes, lockfile/manifests, Git configuration and checked project/user/global package-manager configuration hashes. The same comparisons around the validation-only action also passed. Main HEAD remained `4d3eb991783924f37f2b62898e3a37daa83ec827`; worktree HEAD remained `fa619bf4075d2c04518b89c8f61374db13798ed0`.

All eight protected task files remained byte-for-byte identical:

- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/components/settings/SettingsScreen.tsx`
- `apps/desktop/src/renderer/components/signup/SignupScreen.tsx`
- `apps/desktop/src/renderer/components/signup/signup.css`
- `apps/desktop/src/renderer/components/signup/signupValidation.ts`
- `apps/desktop/src/renderer/state/NavigationContext.tsx`
- `apps/desktop/tests/signup.test.cjs`
- `docs/verification/signup.md`

Run/task/session/attempt/intervention, conversation and workspace records were unchanged. The successful environment result and validation results live in the separate environment record. Electron was closed and reopened after verification: ready status, consent metadata, validation results, task records and file/config comparisons were identical. Electron was left open on the environment result.

## Application validation

- Focused online/offline/UI/IPC tests: **91/91 passed**.
- Final full serial regression: **472/472 passed**.
- `pnpm typecheck`, `pnpm build`, `git diff --check`: passed.
- Coverage includes no automatic online fallback; explicit consent, expiry, owner/workspace/fingerprint/registry/provider scope; fixed commands and managed store; unsafe registries and safe errors; source preservation; duplicate preparation; process-tree cancellation and cleanup; restart/ready restoration; validation-only operation; old/new repository script shapes; and unchanged agent/renderer network policies.

Local evidence: `.cache/online-plan-proof.json`, `.cache/online-before.json`, `.cache/online-after.json`, `.cache/online-result-proof.json`, `.cache/online-validation-before.json`, `.cache/online-validation-after.json`, `.cache/online-validation-proof.json`, `.cache/online-restoration-proof.json`. These local files retain private references that are not repeated in this report. The main-checkout comparisons cover the runtime actions; implementation changes and this report are intentional development changes outside those action windows.

## Application files changed in this step

Relative to `apps/desktop/`:

- `src/application/environment/WorkspaceEnvironmentProvider.ts`
- `src/application/environment/WorkspaceEnvironmentService.ts`
- `src/main/environment/EnvironmentProcess.ts`
- `src/main/environment/PnpmOfflineProvider.ts`
- `src/main/environment/PnpmRegistry.ts` (new)
- `src/main/environment/PnpmWorkspaceValidation.ts` (new)
- `src/main/environment/WorkspaceEnvironmentStore.ts`
- `src/main/environment/registerWorkspaceEnvironmentIpc.ts`
- `src/preload/orchestrationApi.ts`
- `src/renderer/components/chat/WorkspaceDownloadConfirmation.tsx` (new)
- `src/renderer/components/chat/WorkspaceEnvironmentPanel.tsx`
- `src/shared/orchestration-api.ts`
- `src/shared/workspace-environment.ts`
- `tests/orchestration-main.test.cjs`
- `tests/team-planning-ui.test.cjs`
- `tests/workspace-environment.test.cjs`
- `tests/workspace-online.test.cjs` (new)

This report is also new. Earlier changes remain preserved and uncommitted. Supported scope remains the pinned Flux/pnpm repository contract and public dependencies. Private/authenticated registries are not supported. Browser/responsive/keyboard testing and task workflow evaluation were not performed in this preparation-only step.
