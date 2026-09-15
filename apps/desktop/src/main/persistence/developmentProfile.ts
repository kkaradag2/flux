import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function developmentProfilePath(appData: string): string { return path.join(appData, 'Flux', 'development'); }
const records = ['projects.json', 'agents.json', 'teams.json', 'codex-installation.json', 'codex-runtime-state.json'];
const directories = ['conversations', 'agent-avatars', 'orchestration'];
const exists = async (file: string): Promise<boolean> => { try { await lstat(file); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; } };
/** Copy only Flux-owned records; leave originals and any existing destination records untouched. */
export async function migrateDevelopmentProfile(legacy: string, destination: string): Promise<void> {
  if (!path.isAbsolute(legacy) || !path.isAbsolute(destination) || path.resolve(legacy) === path.resolve(destination)) throw new Error('Profile migration is unavailable.');
  await mkdir(destination, { recursive: true });
  const marker = path.join(destination, '.flux-profile-migrated');
  if (await exists(marker) || !await exists(legacy)) return;
  if ((await lstat(legacy)).isSymbolicLink() || (await lstat(destination)).isSymbolicLink()) throw new Error('Profile migration is unavailable.');
  const copy = async (relative: string): Promise<void> => {
    const source = path.join(legacy, relative), target = path.join(destination, relative);
    if (!await exists(source)) return;
    const metadata = await lstat(source);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error('Profile migration is unavailable.');
    if (await exists(target)) return;
    const temporary = target + '.' + randomUUID() + '.tmp';
    try { await copyFile(source, temporary, constants.COPYFILE_EXCL); await rename(temporary, target); }
    finally { await unlink(temporary).catch(() => undefined); }
  };
  for (const file of records) await copy(file);
  for (const folder of directories) {
    const source = path.join(legacy, folder), target = path.join(destination, folder);
    if (!await exists(source)) continue;
    if ((await lstat(source)).isSymbolicLink() || (await exists(target) && (await lstat(target)).isSymbolicLink())) throw new Error('Profile migration is unavailable.');
    await mkdir(target, { recursive: true });
    for (const file of await readdir(source)) {
      const allowed = folder === 'agent-avatars' ? /^[a-f0-9-]+\.(png|jpe?g|webp)$/i : /^[a-f0-9-]+\.json$/i;
      if (allowed.test(file)) await copy(path.join(folder, file));
    }
  }
  await writeFile(marker, '1\n', { flag: 'wx', mode: 0o600 });
}
