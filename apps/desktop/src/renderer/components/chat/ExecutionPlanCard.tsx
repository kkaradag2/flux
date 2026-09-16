import type { ConversationOrchestrationView } from '../../../shared/orchestration-api';
import { TaskList } from '../tasks/TaskList';
export function ExecutionPlanCard({ view, onExecute, onStop, onRetry }: { view: ConversationOrchestrationView; onExecute?: (() => void) | undefined; onStop?: (() => void) | undefined; onRetry?: (() => void) | undefined }) {
  if (!view.plan || !view.run) return null;
  return <section className="execution-plan" aria-label="Execution plan">
    <header><strong>Execution plan</strong><span>{view.run.organizerName} · {view.tasks.length} tasks</span></header>
    <p>{view.plan.summary}</p><TaskList tasks={view.tasks} />
    {!view.execution?.checking && !view.execution?.activeTaskId && view.execution?.retry && <div className="execution-retry"><p>{view.execution.retry.message}</p><small>Previous attempt: {view.execution.retry.attempt}</small><br /><button type="button" className="execution-action" onClick={onRetry}>Retry execution</button></div>}
    {(view.execution?.activeTaskId || view.execution?.checking) ? <button type="button" className="execution-action" onClick={onStop}>Stop</button> : view.execution?.canStart && <button type="button" className="execution-action" onClick={onExecute}>{view.execution.hasExecuted ? 'Run next task' : 'Start execution'}</button>}
  </section>;
}
