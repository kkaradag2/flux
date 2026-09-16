import { publicPnpmRegistry, safeDownloadCode, validateLockfileDownloads } from './PnpmRegistry';
import { validatePnpmWorkspace } from './PnpmWorkspaceValidation';
import { lstat, realpath, readFile, readdir, mkdir, mkdtemp, cp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import type { WorkspaceEnvironmentContext, WorkspaceEnvironmentPlan, WorkspaceEnvironmentProvider, WorkspaceEnvironmentPreparationResult } from '../../application/environment/WorkspaceEnvironmentProvider';
import { EnvironmentProcess, isolatedEnvironment } from './EnvironmentProcess';
import { GitCommandRunner } from '../projects/GitCommandRunner';
const fingerprint = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const version = '9.15.9';
const contractVersion = '2';
const config = ['node-linker=hoisted','store-dir=.pnpm-store','cache-dir=.cache/pnpm','state-dir=.cache/pnpm-state','cache=.cache/npm'];
export const onlineInstallArgs = ['install','--frozen-lockfile','--ignore-scripts','--ignore-pnpmfile','--package-import-method','copy','--reporter','ndjson','--side-effects-cache-readonly','--verify-store-integrity','--network-concurrency','4'] as const;
export const offlineInstallArgs = ['install','--offline','--frozen-lockfile','--ignore-scripts','--ignore-pnpmfile','--package-import-method','copy','--reporter','silent','--side-effects-cache-readonly'] as const;
export async function plainPath(root: string, relative: string, optional = false): Promise<string> {
  const target = path.resolve(root, relative), rel = path.relative(root, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Unsafe environment path');
  let current = root;
  for (const part of rel.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error('Unsafe environment link'); }
    catch (e) { if (optional && (e as NodeJS.ErrnoException).code === 'ENOENT') continue; throw e; }
  }
  return target;
}
async function plainTree(directory: string, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new Error('Cancelled');
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name), stat = await lstat(file);
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) throw new Error('Unsafe environment store');
    if (stat.isDirectory()) await plainTree(file, signal);
  }
}
/** Only the installed, pinned package is read. Never invoke Corepack's downloading shim. */
export async function resolvePnpm(): Promise<{ executable: string; prefix: string[] } | null> {
  const home = process.env.COREPACK_HOME ?? path.join(process.env.XDG_CACHE_HOME ?? process.env.LOCALAPPDATA ?? path.join(os.homedir(), process.platform === 'win32' ? 'AppData/Local' : '.cache'), 'node/corepack');
  const directory = path.join(home, 'v1', 'pnpm', version);
  try {
    if ((await lstat(directory)).isSymbolicLink()) return null;
    const manifest = JSON.parse(await readFile(await plainPath(directory, 'package.json'), 'utf8'));
    if (manifest.name !== 'pnpm' || manifest.version !== version || manifest.bin?.pnpm !== 'bin/pnpm.cjs') return null;
    return { executable: await realpath(process.execPath), prefix: [await plainPath(directory, 'bin/pnpm.cjs')] };
  } catch { return null; }
}
export class PnpmOfflineProvider implements WorkspaceEnvironmentProvider {
  readonly id = 'pnpm-offline';
  constructor(private runner = new EnvironmentProcess(), private resolver = resolvePnpm, private git = new GitCommandRunner()) {}
  private async inputs(context: WorkspaceEnvironmentContext) {
    const cwd = context.directory;
    if ((await lstat(cwd)).isSymbolicLink() || path.resolve(await realpath(cwd)).toLowerCase() !== path.resolve(cwd).toLowerCase()) throw new Error('Unsafe workspace');
    const files = ['pnpm-lock.yaml','pnpm-workspace.yaml','package.json','.npmrc','apps/desktop/package.json'];
    const contents = await Promise.all(files.map(async file => readFile(await plainPath(cwd, file), 'utf8')));
    const root = JSON.parse(contents[2]!), desktop = JSON.parse(contents[4]!);
    if (root.name !== 'flux' || root.packageManager !== 'pnpm@' + version || root.private !== true || desktop.name !== '@flux/desktop') return null;
    if (contents[3]!.trim().split(/\r?\n/).map(s => s.trim()).join('\n') !== config.join('\n')) return null;
    // Current Flux workspace layout only. Unknown project config/overrides fail closed.
    const workspace = contents[1]!.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#')).join('\n');
    if (workspace !== "packages:\n- 'apps/*'\n- 'packages/*'") return null;
    if (root.pnpm || desktop.pnpm || root.workspaces || root.resolutions || desktop.resolutions) return null;
    if (/(?:^|[\s'"{])(?:file:|link:|git\+|directory:)/im.test(contents[0]!)) return null;
    for (const manifest of [root, desktop]) for (const section of ['dependencies','devDependencies','optionalDependencies']) {
      for (const value of Object.values(manifest[section] ?? {})) if (typeof value !== 'string' || !/^[~^]?\d[\d.x*| <>=~-]*$/.test(value)) return null;
    }
    for (const dir of ['apps', 'packages']) {
      try { for (const e of await readdir(await plainPath(cwd, dir), { withFileTypes: true })) if (e.isSymbolicLink() || (e.name !== (dir === 'apps' ? 'desktop' : '') && e.isDirectory())) return null; }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    }
    for (const relative of ['apps/desktop/.npmrc','apps/desktop/pnpm-workspace.yaml']) {
      try { await lstat(path.join(cwd, relative)); return null; } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    }
    return { fingerprint: fingerprint(contents[0]!), configurationFingerprint: fingerprint(contents.join('\0')) };
  }
  async detect(context: WorkspaceEnvironmentContext): Promise<WorkspaceEnvironmentPlan | null> {
    try {
      const inputs = await this.inputs(context), resolved = await this.resolver(); if (!inputs || !resolved) return null;
      const env = isolatedEnvironment(context.directory, true), signal = new AbortController().signal;
      const result = await this.runner.run({ ...resolved, args: [...resolved.prefix, '--version'], cwd: context.directory, env }, signal, 10000);
      if (result.exitCode !== 0 || result.output.trim() !== version) return null;
      return { providerId: this.id, contractVersion, fingerprint: inputs.fingerprint, description: 'pnpm', mode: 'offline' };
    } catch { return null; }
  }
  async isReady(context: WorkspaceEnvironmentContext, plan: WorkspaceEnvironmentPlan) {
    try {
      const inputs = await this.inputs(context), marker = JSON.parse(await readFile(await plainPath(context.directory, '.cache/workspace-environment/ready.json'), 'utf8'));
      await plainPath(context.directory, 'node_modules/.modules.yaml');
      return inputs?.fingerprint === plan.fingerprint && marker.fingerprint === plan.fingerprint && marker.configurationFingerprint === inputs.configurationFingerprint && marker.contractVersion === contractVersion && (!marker.registryFingerprint || marker.registryFingerprint === publicPnpmRegistry().fingerprint);
    } catch { return false; }
  }
  private async sourceSnapshot(cwd: string) {
    const listing = await this.git.run(cwd, ['ls-files','-z','--cached','--others','--exclude-standard'],10000,true);
    const hashes: Record<string,string> = {};
    for (const name of [...new Set(listing.split('\0').filter(Boolean))].sort()) {
      try { hashes[name] = fingerprint(await readFile(await plainPath(cwd, name))); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') hashes[name] = 'missing'; else throw e; }
    }
    return JSON.stringify(hashes);
  }
  async prepare(context: WorkspaceEnvironmentContext, plan: WorkspaceEnvironmentPlan, signal: AbortSignal): Promise<WorkspaceEnvironmentPreparationResult> {
    const cwd = context.directory, before = await this.inputs(context);
    if (!before || before.fingerprint !== plan.fingerprint) return { code: 'lockfile_changed' };
    const resolved = await this.resolver(); if (!resolved) return { code: 'provider_unavailable' };
    if (signal.aborted) return { code: 'preparation_cancelled' };
    // Only the repository-configured local store is supported. Do not search other projects or global stores.
    let store: string;
    try { store = await plainPath(cwd, '.pnpm-store'); await plainTree(store, signal); if (!(await readdir(store)).length) return { code: 'offline_dependencies_unavailable' }; }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { code: 'offline_dependencies_unavailable' }; throw e; }
    for (const name of ['.cache','node_modules','apps/desktop/node_modules']) {
      const destination = await plainPath(cwd, name, true);
      try { await plainTree(destination, signal); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    }
    const snapshot = await this.sourceSnapshot(cwd);
    // All writable runtime state stays under ignored worktree directories. Refuse a repository without these ignore rules.
    await this.git.run(cwd, ['check-ignore','.cache/workspace-environment/probe','node_modules/probe','apps/desktop/node_modules/probe']);
    const scratch = await plainPath(cwd, '.cache/workspace-environment', true);
    await mkdir(scratch, { recursive: true });
    const isolatedStore = path.join(await mkdtemp(path.join(scratch, 'attempt-')), 'store');
    // Copy rather than link: pnpm may update store metadata even during offline installs.
    await cp(store, isolatedStore, { recursive: true, dereference: false, errorOnExist: true, force: false, filter: () => { if (signal.aborted) throw new Error('Cancelled'); return true; } });
    await plainTree(isolatedStore, signal);
    const result = await this.runner.run({ executable: resolved.executable, args: [...resolved.prefix, ...offlineInstallArgs, '--store-dir', isolatedStore], cwd, env: isolatedEnvironment(cwd) }, signal);
    const after = await this.inputs(context);
    if (!after || after.fingerprint !== before.fingerprint || after.configurationFingerprint !== before.configurationFingerprint) return { code: 'lockfile_changed' };
    if (await this.sourceSnapshot(cwd) !== snapshot) return { code: 'preparation_failed' };
    if (result.exitCode !== 0) return { code: /ERR_PNPM_(?:NO_OFFLINE_(?:TARBALL|META)|MISSING_PACKAGE)/.test(result.output) ? 'offline_dependencies_unavailable' : 'preparation_failed' };
    await writeFile(path.join(scratch, 'ready.json'), JSON.stringify({ fingerprint: plan.fingerprint, configurationFingerprint: before.configurationFingerprint, contractVersion }), { flag: 'w' });
    return { code: await this.isReady(context, plan) ? 'ready' : 'preparation_failed' };
  }
  async onlinePlan(context: WorkspaceEnvironmentContext): Promise<WorkspaceEnvironmentPlan | null> {
    const inputs = await this.inputs(context), detected = await this.detect(context); if (!inputs || !detected) return null;
    const registry = publicPnpmRegistry();
    validateLockfileDownloads(await readFile(await plainPath(context.directory, 'pnpm-lock.yaml'), 'utf8'));
    return { ...detected, mode: 'online_with_confirmation', registryHost: registry.host,
      sourceFingerprint: fingerprint(inputs.configurationFingerprint + registry.fingerprint) };
  }
  async prepareOnline(context: WorkspaceEnvironmentContext, plan: WorkspaceEnvironmentPlan, signal: AbortSignal,
    progress: (stage: import('../../shared/workspace-environment').WorkspaceEnvironmentStage) => void): Promise<WorkspaceEnvironmentPreparationResult> {
    progress('resolving_registry');
    let current: WorkspaceEnvironmentPlan | null;
    try { current = await this.onlinePlan(context); } catch { return { code: 'registry_not_allowed' }; }
    if (!current || JSON.stringify(current) !== JSON.stringify(plan)) return { code: 'lockfile_changed' };
    const registry = publicPnpmRegistry(), cwd = context.directory, before = await this.inputs(context), resolved = await this.resolver();
    if (!before || !resolved) return { code: 'provider_unavailable' };
    if (signal.aborted) return { code: 'preparation_cancelled' };
    for (const name of ['.cache','node_modules','apps/desktop/node_modules']) {
      const destination = await plainPath(cwd, name, true);
      try { await plainTree(destination, signal); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
    }
    const snapshot = await this.sourceSnapshot(cwd);
    await this.git.run(cwd, ['check-ignore','.cache/workspace-environment/probe','node_modules/probe','apps/desktop/node_modules/probe']);
    const scratch = await plainPath(cwd, '.cache/workspace-environment', true); await mkdir(scratch, { recursive: true });
    const store = await plainPath(cwd, '.cache/workspace-environment/online-store', true);
    progress('downloading_dependencies');
    let linked = false;
    const result = await this.runner.run({ executable: resolved.executable,
      args: [...resolved.prefix, ...onlineInstallArgs, '--registry', registry.url, '--store-dir', store], cwd, env: isolatedEnvironment(cwd),
      onLine: line => { try { const event = JSON.parse(line); if (!linked && event.name === 'pnpm:stage' && event.stage === 'importing_started') { linked = true; progress('linking_workspace'); } } catch { /* No raw output crosses this boundary. */ } },
    }, signal, 600000);
    progress('verifying_lockfile');
    const after = await this.inputs(context);
    if (!after || after.fingerprint !== before.fingerprint || after.configurationFingerprint !== before.configurationFingerprint) return { code: 'lockfile_changed' };
    if (await this.sourceSnapshot(cwd) !== snapshot) return { code: 'preparation_failed' };
    if (result.exitCode !== 0) return { code: safeDownloadCode(result.output) };
    if (signal.aborted) return { code: 'preparation_cancelled' };
    await writeFile(await plainPath(cwd, '.cache/workspace-environment/ready.json', true), JSON.stringify({ fingerprint: plan.fingerprint, configurationFingerprint: before.configurationFingerprint, contractVersion, registryFingerprint: registry.fingerprint }), { flag: 'w' });
    return { code: await this.isReady(context, plan) ? 'ready' : 'preparation_failed' };
  }
  validate(context: WorkspaceEnvironmentContext, signal: AbortSignal) {
    return validatePnpmWorkspace(context.directory, this.runner, this.git, relative => plainPath(context.directory, relative), () => this.sourceSnapshot(context.directory), signal);
  }

}
