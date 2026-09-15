export type InstallationMethod = 'npm' | 'standalone' | 'unknown';
export type CodexInstallationCandidate = {
  id: string; version: string; executablePath: string; installationMethod: InstallationMethod;
  isFirstOnPath: boolean; isCurrentlySelected: boolean; canUpdate: boolean; displayPath: string;
};
// Private paths are returned only by the local installation-dialog API.
export type CodexInstallationSummary = { id: string | null; canUpdate: boolean; selectionRequired: boolean };
