import { createHash } from 'node:crypto';
/** Pinned public registry policy. Private registries and credentials are not supported. */
export function allowedRegistry(value: string): { url: string; host: string; fingerprint: string } {
  let url: URL; try { url = new URL(value); } catch { throw new Error('registry_not_allowed'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port || url.hostname !== 'registry.npmjs.org' || url.pathname !== '/') throw new Error('registry_not_allowed');
  return { url: url.href, host: url.hostname, fingerprint: createHash('sha256').update(url.href).digest('hex') };
}
// pnpm 9.15.9's verified default. Project config is separately checked against the Flux contract.
export const publicPnpmRegistry = () => allowedRegistry('https://registry.npmjs.org/');
export function safeDownloadCode(output: string): import('../../shared/workspace-environment').WorkspaceEnvironmentCode {
  if (/ERR_PNPM_(?:FETCH_(?:401|403)|AUTH)|\b(?:401 Unauthorized|403 Forbidden)\b/.test(output)) return 'authentication_required';
  if (/ERR_PNPM_(?:TARBALL_INTEGRITY|UNEXPECTED_PKG_CONTENT_IN_STORE)|EINTEGRITY/.test(output)) return 'integrity_failed';
  if (/ERR_PNPM_(?:OUTDATED_LOCKFILE|LOCKFILE_CONFIG_MISMATCH|FROZEN_LOCKFILE_WITH_OUTDATED_LOCKFILE)/.test(output)) return 'lockfile_changed';
  return 'download_failed';
}
export function validateLockfileDownloads(lockfile: string) {
  // Public registry packages plus the existing pinned Electron source archive only.
  for (const match of lockfile.matchAll(/tarball:\s*([^\s,}]+)/g)) {
    const value = match[1]!.replace(/^['"]|['"]$/g, ''); let url: URL;
    try { url = new URL(value); } catch { throw new Error('registry_not_allowed'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port
      || !(url.hostname === 'registry.npmjs.org' || (url.hostname === 'codeload.github.com' && /^\/electron\/node-gyp\/tar.gz\/[a-f0-9]{40}$/.test(url.pathname)))) throw new Error('registry_not_allowed');
  }
}
