import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConversationDetail } from '../../shared/conversation-api';
import type { ConversationOrchestrationView, OrchestrationChange } from '../../shared/orchestration-api';
import type { SingleAgentInput } from '../../shared/single-agent-api';
import { savedChatMessages } from './useSingleAgentChat';

export function acceptsPlanningChange(conversation: ConversationDetail | null, change: OrchestrationChange): boolean {
  return conversation?.mode === 'team' && conversation.id === change.conversationId
    && (!change.view.conversation || conversation.projectId === change.view.conversation.projectId);
}
export function useTeamPlanning() {
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [view, setView] = useState<ConversationOrchestrationView | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const current = useRef<ConversationDetail | null>(null), latest = useRef<ConversationOrchestrationView | null>(null);
  const generation = useRef(0), alive = useRef(false), pending = useRef(false), stopRequested = useRef(false);
  const retain = useCallback((detail: ConversationDetail) => { current.current = detail; setConversation(detail); }, []);
  const accept = useCallback((change: OrchestrationChange) => {
    if (!alive.current || !acceptsPlanningChange(current.current, change)) return;
    latest.current = change.view; setView(change.view);
    if (change.view.conversation) retain(change.view.conversation);
    if (stopRequested.current && change.view.run && (change.view.run?.status === 'planning' || change.view.followUp?.evaluating)) void window.flux.cancelTeamPrompt({ runId: change.view.run.id });
  }, [retain]);
  useEffect(() => {
    alive.current = true; const off = window.flux.subscribeToOrchestrationChanges(accept);
    return () => { alive.current = false; generation.current++; off(); };
  }, [accept]);
  const open = useCallback(async (detail: ConversationDetail) => {
    const ticket = ++generation.current; retain(detail); setView(null); latest.current = null; setError(null); pending.current = false; setBusy(false);
    try {
      const result = await window.flux.getConversationOrchestration(detail.id);
      if (!alive.current || ticket !== generation.current) return;
      if (result.ok) accept({ conversationId: detail.id, view: result.value });
      else setError(result.error.message);
    } catch { if (ticket === generation.current && alive.current) setError('Planning history could not be loaded.'); }
  }, [retain, accept]);
  const execute = useCallback((retry = false) => {
    const run = latest.current?.run, detail = current.current;
    if (!run || !detail || pending.current || !(retry ? latest.current?.execution?.retry : latest.current?.execution?.canStart)) return;
    pending.current = true; stopRequested.current = false; setError(null); const ticket = generation.current;
    void (retry ? window.flux.retryTaskExecution({ runId: run.id }) : window.flux.startNextTaskExecution({ runId: run.id })).then(result => {
      if (!alive.current || ticket !== generation.current) return;
      if (result.ok) accept({ conversationId: detail.id, view: result.value }); else setError(result.error.message);
    }).catch(() => { if (alive.current && ticket === generation.current) setError('Task execution could not finish. Partial work was preserved.'); })
      .finally(() => { if (alive.current && ticket === generation.current) pending.current = false; });
  }, [accept]);
  const followUp = useCallback((continuation = false) => {
    const run = latest.current?.run, detail = current.current;
    if (!run || !detail || pending.current || !(continuation ? latest.current?.followUp?.canContinueTask : latest.current?.followUp?.canAsk)) return;
    pending.current = true; stopRequested.current = false; setError(null); const ticket = generation.current;
    void (continuation ? window.flux.continueAttentionTask({ runId: run.id }) : window.flux.requestOrganizerFollowUp({ runId: run.id })).then(result => {
      if (!alive.current || ticket !== generation.current) return;
      if (result.ok) accept({ conversationId: detail.id, view: result.value }); else setError(result.error.message);
    }).catch(() => { if (alive.current && ticket === generation.current) setError(continuation ? 'Task continuation could not finish. Existing work was preserved.' : 'Organizer follow-up could not finish.'); })
      .finally(() => { if (alive.current && ticket === generation.current) pending.current = false; });
  }, [accept]);
  const stop = useCallback(() => {
    stopRequested.current = true;
    const run = latest.current?.run;
    if (run && (latest.current?.execution?.activeTaskId || latest.current?.execution?.checking)) { void window.flux.cancelTaskExecution({ runId: run.id }).then(result => { if (!result.ok && alive.current) setError('Task execution could not be stopped. Try Stop again.'); }).catch(() => { if (alive.current) setError('Task execution could not be stopped. Try Stop again.'); }); return; }
    if (run && (run.status === 'planning' || latest.current?.followUp?.evaluating)) void window.flux.cancelTeamPrompt({ runId: run.id }).then(result => {
      if (!result.ok && alive.current) setError('Planning could not be stopped. Try Stop again.');
    }).catch(() => { if (alive.current) setError('Planning could not be stopped. Try Stop again.'); });
  }, []);
  const reset = useCallback(() => {
    if (pending.current || latest.current?.run?.status === 'planning') stop();
    generation.current++; current.current = null; latest.current = null; pending.current = false;
    setConversation(null); setView(null); setBusy(false); setError(null);
  }, [stop]);
  const send = useCallback((input: SingleAgentInput): boolean => {
    if (pending.current || latest.current?.run?.status === 'planning' || !input.prompt.trim()) return false;
    if (latest.current?.run?.status === 'running') { setError('Use the execution plan controls to run the next task. Plan revision is not available yet.'); return false; }
    pending.current = true; stopRequested.current = false; setBusy(true); setError(null);
    const ticket = generation.current, isCurrent = () => alive.current && ticket === generation.current;
    void (async () => {
      try {
        let detail = current.current;
        if (!detail) {
          const created = await window.flux.createTeamConversation({ projectId: input.projectId, branch: input.branch, teamId: input.teamId });
          if (!isCurrent()) return;
          if (!created.ok) { setError(created.error.message); return; }
          detail = created.value; retain(detail);
        }
        if (stopRequested.current) return;
        const run = latest.current?.run;
        const result = run?.status === 'waiting_input' || run?.canContinue
          ? await window.flux.continueTeamPrompt({ runId: run.id, message: input.prompt.trim() })
          : await window.flux.startTeamPrompt({ conversationId: detail.id, projectId: detail.projectId, branch: detail.branchName, teamId: detail.teamId, message: input.prompt.trim() });
        if (!isCurrent()) return;
        if (result.ok) accept({ conversationId: detail.id, view: result.value.view });
        else { setError(result.error.message); const saved = await window.flux.getConversationOrchestration(detail.id); if (isCurrent() && saved.ok) accept({ conversationId: detail.id, view: saved.value }); }
      } catch { if (isCurrent()) setError('Planning could not finish. Send the request again.'); }
      finally { if (isCurrent()) { pending.current = false; setBusy(false); } }
    })();
    return true;
  }, [accept, retain]);
  const activeTask = view?.tasks.find(task => task.id === view.execution?.activeTaskId);
  const running = !!view?.followUp?.evaluating || !!activeTask || !!view?.execution?.checking || busy || view?.run?.status === 'planning';
  return { conversation, view, messages: conversation ? savedChatMessages(conversation) : [], running,
    workingAgentId: activeTask ? activeTask.assignee.id : view?.execution?.checking ? null : running ? view?.run?.organizerAgentId ?? conversation?.leadAgentId ?? null : null,
    error, open, reset, send, stop, askOrganizer: () => followUp(false), continueAttention: () => followUp(true), execute: () => execute(false), retry: () => execute(true) };
}
