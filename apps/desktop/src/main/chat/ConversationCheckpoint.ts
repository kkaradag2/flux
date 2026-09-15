import type { Conversation, ConversationStore } from './ConversationRepository';
// Coalesce token updates; final flush is ordered after any in-flight checkpoint.
export class ConversationCheckpoint {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private dirty = false;
  private pending: Promise<void> = Promise.resolve();
  constructor(private store: ConversationStore, private current: () => Conversation, private onError: () => void, private intervalMs = 2000) {}
  changed(): void {
    this.dirty = true;
    this.timer ??= setTimeout(() => { this.timer = undefined; void this.flush().catch(this.onError); }, this.intervalMs);
  }
  flush(): Promise<void> {
    clearTimeout(this.timer); this.timer = undefined;
    if (this.dirty) {
      this.dirty = false;
      const snapshot = structuredClone(this.current());
      this.pending = this.pending.catch(() => undefined).then(() => this.store.save(snapshot));
    }
    return this.pending;
  }
}
