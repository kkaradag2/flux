/** Provider-independent durable intervention metadata. Exact decisions are validated by the application. */
export type TaskIntervention = Readonly<{
  id: string; taskId: string; sourceTaskRevision: number; sourceResultRevision: number;
  status: 'pending' | 'decided' | 'applied' | 'cancelled' | 'failed';
  decision: Readonly<{ type: 'continue_task' | 'accept_result' | 'ask_user'; taskId: string; message: string; guidance?: string; questions?: readonly string[] }> | null;
  createdAt: string; updatedAt: string; durationMs?: number;
}>;
