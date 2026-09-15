import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { SmokeTestError } from './contracts';

export async function confirmProcessExit(child: ChildProcessWithoutNullStreams, terminate: () => Promise<void>): Promise<void> {
 let exited = child.exitCode !== null || child.signalCode !== null;
 let resolveExit!: () => void;
 const exit = new Promise<void>(resolve => { resolveExit = resolve; });
 const onClose = (): void => { exited = true; resolveExit(); };
 child.once('close', onClose);
 let timer: ReturnType<typeof setTimeout> | undefined;
 try {
  await terminate();
  if (!exited) await Promise.race([exit, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new SmokeTestError('CLEANUP_FAILED')), 2000); })]);
 } finally { clearTimeout(timer); child.off('close', onClose); }
}
