import path from 'node:path';
import { lstat, realpath } from 'node:fs/promises';
import { OrchestrationPersistenceError } from '../../application/orchestration/OrchestrationPersistenceError';

export type OrchestrationStorageLocation = Readonly<{
  /** Supplied by Electron's app.getPath('userData'), never by a renderer. */
  userDataDirectory: string;
  /** Registered project roots and managed worktree roots, supplied by the host. */
  excludedDirectories: readonly string[];
}>;
const key = (value: string): string => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
function inside(parent: string, child: string): boolean {
  const relative = path.relative(key(parent), key(child));
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep));
}
async function canonical(directory: string): Promise<string> {
  try { return await realpath(directory); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || path.dirname(directory) === directory) throw error;
    return path.join(await canonical(path.dirname(directory)), path.basename(directory));
  }
}
export async function orchestrationDirectory(location: OrchestrationStorageLocation): Promise<string> {
  try {
    for (const directory of [location.userDataDirectory, ...location.excludedDirectories]) {
      if (!path.isAbsolute(directory) || directory.includes('\0')) throw new OrchestrationPersistenceError('UNSAFE_LOCATION');
    }
    const profile = await canonical(location.userDataDirectory), directory = path.join(profile, 'orchestration');
    for (const excluded of location.excludedDirectories) {
      if (inside(excluded, location.userDataDirectory) || inside(await canonical(excluded), profile)) throw new OrchestrationPersistenceError('UNSAFE_LOCATION');
    }
    try { if ((await lstat(directory)).isSymbolicLink()) throw new OrchestrationPersistenceError('UNSAFE_LOCATION'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    return directory;
  } catch { throw new OrchestrationPersistenceError('UNSAFE_LOCATION'); }
}
