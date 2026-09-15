import path from 'node:path';
export type RuntimeCommand = 'version' | 'login-status' | 'app-server' | 'npm-prefix' | 'npm-update';
export function codexArguments(command: RuntimeCommand): string[] {
  if (command === 'npm-prefix') return ['prefix', '-g'];
  if (command === 'npm-update') return ['install', '-g', '@openai/codex@latest'];
  if (command === 'app-server') return ['app-server'];
  if (command === 'version') return ['--version'];
  if (command === 'login-status') return ['login', 'status'];
  throw new Error('Unsupported runtime check.');
}
export function windowsShimCommand(executable: string, command: RuntimeCommand, systemRoot: string) {
  // cmd expands metacharacters even inside some quoted contexts. Reject them,
  // and accept only an absolute, resolved Codex shim, never renderer input.
  const expected = command === 'npm-prefix' || command === 'npm-update' ? 'npm.cmd' : 'codex.cmd';
  if (!path.win32.isAbsolute(executable) || path.win32.basename(executable).toLowerCase() !== expected || /["%!^&|<>\r\n\0]/.test(executable)) throw new Error('Unsafe runtime shim path.');
  if (!path.win32.isAbsolute(systemRoot) || /["%!^&|<>\r\n\0]/.test(systemRoot)) throw new Error('Invalid Windows system path.');
  return { executable: path.win32.join(systemRoot, 'System32', 'cmd.exe'), args: ['/d', '/s', '/v:off', '/c', '""' + executable + '" ' + codexArguments(command).join(' ') + '"'], verbatim: true };
}
