import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { SmokeTestError, record, type AppServerRequests, type ServerNotification, type ServerRequest } from './contracts';
export interface AppServerWire {
  request<M extends keyof AppServerRequests>(method: M, params: AppServerRequests[M]): Promise<unknown>;
  notify(method: 'initialized'): Promise<void>;
  reply(id: string | number, result: unknown, error?: boolean): Promise<void>;
  onNotification(listener: (notification: ServerNotification) => void): () => void;
  onRequest(listener: (request: ServerRequest) => void): () => void;
  onFailure(listener: (error: SmokeTestError) => void): () => void;
  close(): Promise<void>;
}
export class CodexAppServerTransport implements AppServerWire {
  private nextId = 0;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: SmokeTestError) => void }>();
  private notifications = new Set<(value: ServerNotification) => void>();
  private requests = new Set<(value: ServerRequest) => void>();
  private failures = new Set<(error: SmokeTestError) => void>();
  private decoder = new StringDecoder('utf8');
  private buffer = '';
  private totalBytes = 0;
  private failure: SmokeTestError | null = null;
  private closed = false;
  private closing: Promise<void> | null = null;
  constructor(private child: ChildProcessWithoutNullStreams, private terminate: () => Promise<void>) {
    child.stdout.on('data', this.data);
    child.stderr.on('data', this.discard);
    child.on('error', this.processError);
    child.on('close', this.processExit);
    child.stdin.on('error', this.processError);
  }
  private discard = (): void => { /* Drain stderr without storing or forwarding it. */ };
  private processError = (): void => this.fail(new SmokeTestError('START_FAILED'));
  private processExit = (): void => this.fail(new SmokeTestError('PROCESS_EXIT'));
  private data = (chunk: Buffer): void => {
    if (this.closed || this.failure) return;
    this.totalBytes += chunk.length;
    if (this.totalBytes > 8 * 1024 * 1024) { this.fail(new SmokeTestError('PROTOCOL_ERROR')); return; }
    this.buffer += this.decoder.write(chunk);
    if (this.buffer.length > 1024 * 1024) { this.fail(new SmokeTestError('PROTOCOL_ERROR')); return; }
    let newline: number;
    while ((newline = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newline).trim(); this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      try { this.message(JSON.parse(line)); } catch { this.fail(new SmokeTestError('PROTOCOL_ERROR')); return; }
    }
  };
  private message(value: unknown): void {
    if (!record(value)) throw new SmokeTestError('PROTOCOL_ERROR');
    if ('method' in value) {
      if (typeof value.method !== 'string' || !record(value.params ?? {})) throw new SmokeTestError('PROTOCOL_ERROR');
      if ('id' in value) {
        if (typeof value.id !== 'string' && typeof value.id !== 'number') throw new SmokeTestError('PROTOCOL_ERROR');
        for (const listener of this.requests) listener({ id: value.id, method: value.method, params: value.params });
      } else for (const listener of this.notifications) listener({ method: value.method, params: value.params });
    } else {
      if (typeof value.id !== 'number' || !this.pending.has(value.id) || (('result' in value) === ('error' in value))) throw new SmokeTestError('PROTOCOL_ERROR');
      const pending = this.pending.get(value.id)!; this.pending.delete(value.id);
      if ('error' in value) pending.reject(new SmokeTestError('PROTOCOL_ERROR')); else pending.resolve(value.result);
    }
  }
  private fail(error: SmokeTestError): void {
    if (this.closed || this.failure) return; this.failure = error;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear(); for (const listener of this.failures) listener(error);
  }
  private write(value: unknown): Promise<void> {
    if (this.closed || this.failure) return Promise.reject(this.failure ?? new SmokeTestError('PROCESS_EXIT'));
    return new Promise((resolve, reject) => this.child.stdin.write(JSON.stringify(value) + '\n', error => error ? reject(new SmokeTestError('PROCESS_EXIT')) : resolve()));
  }
  request<M extends keyof AppServerRequests>(method: M, params: AppServerRequests[M]): Promise<unknown> {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); void this.write({ id, method, params }).catch(() => { this.pending.delete(id); reject(new SmokeTestError('PROCESS_EXIT')); }); });
  }
  notify(method: 'initialized'): Promise<void> { return this.write({ method }); }
  reply(id: string | number, result: unknown, error = false): Promise<void> { return this.write(error ? { id, error: { code: -32601, message: 'Unsupported during connection test.' } } : { id, result }); }
  onNotification(listener: (value: ServerNotification) => void): () => void { this.notifications.add(listener); return () => this.notifications.delete(listener); }
  onRequest(listener: (value: ServerRequest) => void): () => void { this.requests.add(listener); return () => this.requests.delete(listener); }
  onFailure(listener: (error: SmokeTestError) => void): () => void { this.failures.add(listener); if (this.failure) listener(this.failure); return () => this.failures.delete(listener); }
  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    this.closing = (async () => {
      try { await this.terminate(); }
      finally {
        this.child.stdout.off('data', this.data); this.child.stderr.off('data', this.discard); this.child.off('error', this.processError); this.child.off('close', this.processExit); this.child.stdin.off('error', this.processError);
        this.child.stdin.destroy(); this.child.stdout.destroy(); this.child.stderr.destroy();
        for (const pending of this.pending.values()) pending.reject(new SmokeTestError('CANCELLED'));
        this.pending.clear(); this.notifications.clear(); this.requests.clear(); this.failures.clear(); this.buffer = '';
      }
    })();
    return this.closing;
  }
}
