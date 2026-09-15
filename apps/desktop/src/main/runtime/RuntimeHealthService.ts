import type { CodexRuntimeHealth } from '../../shared/runtime-health';
export class RuntimeHealthService {
  private cached: CodexRuntimeHealth | null = null;
  private pending: Promise<CodexRuntimeHealth> | null = null;
  constructor(private probe: { check(): Promise<CodexRuntimeHealth> }) {}
  invalidate(): void { this.cached = null; }
  get(): Promise<CodexRuntimeHealth> { return this.pending ?? (this.cached ? Promise.resolve(this.cached) : this.refresh()); }
  refresh(): Promise<CodexRuntimeHealth> {
    if (this.pending) return this.pending;
    this.pending = this.probe.check().then(result => { this.cached = result; return result; }).finally(() => { this.pending = null; });
    return this.pending;
  }
}
