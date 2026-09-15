import type { AgentRuntimeType } from '../../shared/agent-runtime';
import type { AgentRuntimeAdapter, RuntimeCapabilities, RuntimeTurnRequest, RuntimeTurnResult } from './AgentRuntimeAdapter';
import { AgentRuntimeError } from './AgentRuntimeError';
export class AgentRuntimeRouter {
 private adapters = new Map<AgentRuntimeType, AgentRuntimeAdapter>();
 constructor(adapters: readonly AgentRuntimeAdapter[]) {
  for (const adapter of adapters) {
   if (this.adapters.has(adapter.type)) throw new AgentRuntimeError('RUNTIME_PROTOCOL_ERROR');
   this.adapters.set(adapter.type, adapter);
  }
 }
 get(type: AgentRuntimeType, needs: readonly (keyof RuntimeCapabilities)[] = []): AgentRuntimeAdapter {
  const adapter = this.adapters.get(type);
  if (!adapter) throw new AgentRuntimeError('RUNTIME_NOT_SUPPORTED');
  if (needs.some(capability => !adapter.getCapabilities()[capability])) throw new AgentRuntimeError('RUNTIME_CAPABILITY_MISSING');
  return adapter;
 }
 runTurn(type: AgentRuntimeType, request: RuntimeTurnRequest, needs: readonly (keyof RuntimeCapabilities)[]): Promise<RuntimeTurnResult> {
  if (request.session && request.session.runtime !== type) throw new AgentRuntimeError('RUNTIME_PROTOCOL_ERROR');
  return this.get(type, needs).runTurn(request);
 }
}
