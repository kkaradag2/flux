import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { WorkspaceValidation } from '../../shared/workspace-environment';
import { EnvironmentProcess, isolatedEnvironment } from './EnvironmentProcess';
import { GitCommandRunner } from '../projects/GitCommandRunner';

/** Resolve the supported repository scripts into argv; never send script strings to a shell. */
export async function validatePnpmWorkspace(cwd: string, runner: EnvironmentProcess, git: GitCommandRunner,
  safeFile: (relative: string) => Promise<string>, snapshot: () => Promise<string>, signal: AbortSignal): Promise<WorkspaceValidation> {
  const result: WorkspaceValidation = { signup: 'not_run', typecheck: 'not_run', build: 'not_run', diff: 'not_run', sourceUnchanged: true };
  const before = await snapshot(), root = JSON.parse(await readFile(await safeFile('package.json'), 'utf8')),
    desktop = JSON.parse(await readFile(await safeFile('apps/desktop/package.json'), 'utf8'));
  if (root.scripts?.typecheck !== 'pnpm --filter @flux/desktop typecheck' || root.scripts?.build !== 'pnpm --filter @flux/desktop build'
    || root.scripts?.test !== 'node --test apps/desktop/tests/*.test.cjs'
    || desktop.scripts?.build !== 'node scripts/build.mjs') return result;
  const commands = typeof desktop.scripts?.typecheck === 'string' ? desktop.scripts.typecheck.split(' && ') as string[] : [];
  const configs = commands.map(command => /^tsc --noEmit -p (tsconfig\.(?:domain|node|renderer)\.json)$/.exec(command)?.[1]);
  if (!configs.length || configs.length > 3 || configs.some(config => !config) || new Set(configs).size !== configs.length) return result;
  const env = isolatedEnvironment(cwd), desktopCwd = path.join(cwd, 'apps/desktop');
  const unchanged = async () => { result.sourceUnchanged = await snapshot() === before; return result.sourceUnchanged; };
  const run = async (args: string[], directory: string) => {
    if (signal.aborted) return false;
    try { return (await runner.run({ executable: process.execPath, args, cwd: directory, env }, signal, 180000)).exitCode === 0; } catch { return false; }
  };
  result.signup = await run(['--test', await safeFile('apps/desktop/tests/signup.test.cjs')], cwd) ? 'passed' : 'failed';
  if (!await unchanged() || signal.aborted) return result;
  const compiler = await safeFile('node_modules/typescript/bin/tsc');
  let typesPassed = true;
  for (const config of configs as string[]) {
    if (!await run([compiler, '--noEmit', '-p', config], desktopCwd)) { typesPassed = false; break; }
    if (!await unchanged() || signal.aborted) return result;
  }
  result.typecheck = typesPassed ? 'passed' : 'failed';
  if (!await unchanged() || signal.aborted) return result;
  result.build = await run([await safeFile('apps/desktop/scripts/build.mjs')], desktopCwd) ? 'passed' : 'failed';
  if (!await unchanged() || signal.aborted) return result;
  try { await git.run(cwd, ['diff','--check']); result.diff = 'passed'; } catch { result.diff = 'failed'; }
  await unchanged(); return result;
}
