import type { CodexRuntimeHealth } from '../../shared/runtime-health';
import type { RuntimeCommandPort } from './RuntimeCommandRunner';
export class CodexRuntimeProbe {
  constructor(private runner: RuntimeCommandPort) {}
  async check(): Promise<CodexRuntimeHealth> {
    let version: string | null = null;
    const result = (status: CodexRuntimeHealth['status'], message: string, authenticationMethod: string | null = null): CodexRuntimeHealth => ({ runtime: 'codex', status, version, authenticationMethod, message, checkedAt: new Date().toISOString() });
    try {
      const executable = await this.runner.resolveCodex();
      if (!executable) return result('not-installed', 'Codex CLI is not installed or not available on PATH.');
      const versionResult = await this.runner.run(executable, 'version', 5000);
      if (versionResult.timedOut) return result('error', 'Codex version check timed out after 5 seconds.');
      if (versionResult.failed || versionResult.exitCode !== 0) return result('error', 'Codex CLI version could not be checked.');
      // Only a strict version token is allowed to cross the process boundary.
      const match = /^codex-cli\s+(\d{1,6}\.\d{1,6}\.\d{1,6}(?:-[a-z]+(?:\.\d{1,6}){1,4})?)\s*$/m.exec(versionResult.stdout);
      if (!match?.[1]) return result('error', 'Codex CLI returned an unrecognized version.');
      version = match[1];
      const auth = await this.runner.run(executable, 'login-status', 10000);
      if (auth.timedOut) return result('error', 'Codex authentication check timed out after 10 seconds.');
      if (auth.failed || auth.exitCode === null || (auth.exitCode !== 0 && auth.exitCode !== 1)) return result('error', 'Codex authentication status could not be checked.');
      if (auth.exitCode !== 0) return result('not-authenticated', 'Codex CLI is installed but not authenticated.');
      const output = auth.stdout + '\n' + auth.stderr;
      // Emit fixed labels only, never a captured suffix (which can contain a key).
      const method = /^Logged in using ChatGPT\b/im.test(output) ? 'ChatGPT' : /^Logged in using (?:an? )?API key\b/im.test(output) ? 'API key' : null;
      return result('ready', 'Codex CLI is ready.', method);
    } catch { return result('error', 'Codex CLI health could not be checked. Check that the executable is accessible.'); }
  }
}
