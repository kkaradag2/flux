import type { ConversationOrchestrationView } from '../../../shared/orchestration-api';
import { TaskList } from '../tasks/TaskList';
export function ExecutionPlanCard({ view }: { view: ConversationOrchestrationView }) {
  if (!view.plan || !view.run) return null;
  return <section className="execution-plan" aria-label="Execution plan">
    <header><strong>Execution plan</strong><span>{view.run.organizerName} · {view.tasks.length} tasks</span></header>
    <p>{view.plan.summary}</p><TaskList tasks={view.tasks} />
  </section>;
}
