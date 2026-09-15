import path from 'node:path';
export type RuntimeCommand = 'version' | 'login-status';
export function codexArguments(command: RuntimeCommand): string[] {
  if (command === 'version') return ['--version'];
  if (command === 'login-status') return ['login', 'status'];
  throw new Error('Unsupported runtime check.');
}
export function windowsShimCommand(executable: string, command: RuntimeCommand, systemRoot: string) {
  // cmd expands metacharacters even inside some quoted contexts. Reject them,
  // and accept only an absolute, resolved Codex shim, never renderer input.
  if (!path.win32.isAbsolute(executable) || path.win32.basename(executable).toLowerCase() !== 'codex.cmd' || /["%!^&|<>\r\n\0]/.test(executable)) throw new Error('Unsafe Codex shim path.');
  if (!path.win32.isAbsolute(systemRoot) || /["%!^&|<>\r\n\0]/.test(systemRoot)) throw new Error('Invalid Windows system path.');
  return { executable: path.win32.join(systemRoot, 'System32', 'cmd.exe'), args: ['/d', '/s', '/v:off', '/c', '""' + executable + '" ' + codexArguments(command).join(' ') + '"'], verbatim: true };
}
