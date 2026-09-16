import { useState } from 'react';
import { WorkspaceEnvironmentPanel } from './WorkspaceEnvironmentPanel';
import type { ConversationOrchestrationView } from '../../../shared/orchestration-api';
import { TaskList } from '../tasks/TaskList';
export function ExecutionPlanCard({ view, onExecute, onStop, onRetry, onAskOrganizer, onContinueAttention }: { view: ConversationOrchestrationView; onExecute?: (() => void) | undefined; onStop?: (() => void) | undefined; onAskOrganizer?: (() => void) | undefined; onContinueAttention?: (() => void) | undefined; onRetry?: (() => void) | undefined }) {
  const [environmentPreparing, setEnvironmentPreparing] = useState(false);
  if (!view.plan || !view.run) return null;
  return <section className="execution-plan" aria-label="Execution plan">
    <header><strong>Execution plan</strong><span>{view.run.organizerName} · {view.tasks.length} tasks</span></header>
    <p>{view.plan.summary}</p><TaskList tasks={view.tasks} />
    {view.tasks.some(task => task.status === 'needs_attention') && !view.execution?.activeTaskId && !view.execution?.checking && !view.followUp?.evaluating && <WorkspaceEnvironmentPanel key={view.run.id} runId={view.run.id} onPreparing={setEnvironmentPreparing} />}
    <fieldset disabled={environmentPreparing} style={{ border: 0, padding: 0, margin: 0 }}>
    {view.followUp?.canAsk && <button type="button" className="execution-action" onClick={onAskOrganizer}>Ask Organizer</button>}
    {view.followUp?.canContinueTask && <button type="button" className="execution-action" onClick={onContinueAttention}>Continue task</button>}
    {view.followUp?.evaluating && <button type="button" className="execution-action" onClick={onStop}>Stop</button>}
    {!view.followUp?.evaluating && !view.execution?.checking && !view.execution?.activeTaskId && view.execution?.retry && <div className="execution-retry"><p>{view.execution.retry.message}</p><small>Previous attempt: {view.execution.retry.attempt}</small><br /><button type="button" className="execution-action" onClick={onRetry}>Retry execution</button></div>}
    {(view.execution?.activeTaskId || view.execution?.checking) ? <button type="button" className="execution-action" onClick={onStop}>Stop</button> : view.execution?.canStart && <button type="button" className="execution-action" onClick={onExecute}>{view.execution.hasExecuted ? 'Run next task' : 'Start execution'}</button>}
    </fieldset>
  </section>;
}
