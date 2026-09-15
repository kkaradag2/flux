import path from 'node:path';
import { readFile, realpath, stat } from 'node:fs/promises';
export type NpmUpdateTarget = { prefix: string; nodeExecutable: string; npmCli: string };
export async function owningNpmPrefix(executable: string): Promise<string | null> {
  try {
    const windows = process.platform === 'win32';
    const resolved = await realpath(executable);
    const prefix = windows ? path.dirname(resolved) : path.resolve(path.dirname(resolved), '../../../../..');
    const directory = path.join(prefix, windows ? 'node_modules' : 'lib/node_modules', '@openai/codex');
    const metadata: unknown = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
    if (!metadata || typeof metadata !== 'object' || !('name' in metadata) || metadata.name !== '@openai/codex' || !('bin' in metadata) || !metadata.bin || typeof metadata.bin !== 'object' || !('codex' in metadata.bin) || metadata.bin.codex !== 'bin/codex.js') return null;
    const entry = await realpath(path.join(directory, 'bin/codex.js'));
    if (!(await stat(entry)).isFile()) return null;
    if (windows) {
      if (path.basename(resolved).toLowerCase() !== 'codex.cmd') return null;
      const shim = await readFile(resolved, 'utf8');
      if (shim.length > 8192 || !shim.includes('node_modules\\@openai\\codex\\bin\\codex.js')) return null;
    } else if (entry !== resolved) return null;
    return await realpath(prefix);
  } catch { return null; }
}
export async function npmUpdateTarget(prefix: string, npmExecutables: string[], nodeExecutables: string[]): Promise<NpmUpdateTarget | null> {
  // Launch npm's JS entry directly with Node: prefix stays a distinct argv element,
  // including on Windows. No cmd command string is built for targeted updates.
  for (const executable of npmExecutables) {
    try {
      const resolved = await realpath(executable);
      const npmCli = process.platform === 'win32' ? path.join(path.dirname(resolved), 'node_modules/npm/bin/npm-cli.js') : resolved;
      const metadata: unknown = JSON.parse(await readFile(path.join(path.dirname(npmCli), '../package.json'), 'utf8'));
      if (!metadata || typeof metadata !== 'object' || !('name' in metadata) || metadata.name !== 'npm') continue;
      if (!(await stat(npmCli)).isFile()) continue;
      const candidates = process.platform === 'win32' ? [path.join(path.dirname(resolved), 'node.exe'), ...nodeExecutables] : nodeExecutables;
      for (const node of candidates) { try { if ((await stat(node)).isFile()) return { prefix: await realpath(prefix), nodeExecutable: await realpath(node), npmCli: await realpath(npmCli) }; } catch { /* Next named Node candidate. */ } }
    } catch { /* Unknown npm layout: no automatic update. */ }
  }
  return null;
}
