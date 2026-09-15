import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatAgent, RunIdentity, SingleAgentEvent, SingleAgentInput } from '../../shared/single-agent-api';
import type { ConversationDetail } from '../../shared/conversation-api';
export type ChatMessage = { id: string; role: 'user' | 'agent' | 'error'; text: string; agent?: ChatAgent; streaming?: boolean; planRunId?: string };
export function savedChatMessages(conversation: ConversationDetail): ChatMessage[] {
  return conversation.messages.map(message => ({ id: message.id, role: message.role === 'system' ? 'error' : message.role, text: message.content, ...(message.planRunId ? { planRunId: message.planRunId } : {}),
    ...(message.role === 'agent' ? { agent: conversation.agentSnapshot, streaming: message.status === 'streaming' } : {}) }));
}
export function useSingleAgentChat() {
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [opening, setOpening] = useState(false);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [workingAgentId, setWorkingAgentId] = useState<string | null>(null);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const busy = useRef(false), generation = useRef(0), mounted = useRef(false);
  const identity = useRef<RunIdentity | null>(null);
  const accepting = useRef(false), queued = useRef<SingleAgentEvent[]>([]);
  const pieces = useRef(new Map<string, string>());
  const receive = useCallback((event: SingleAgentEvent): void => {
    if (accepting.current) { queued.current.push(event); return; }
    if (!identity.current || event.conversationId !== identity.current.conversationId || event.runId !== identity.current.runId) return;
    const id = event.runId + ':agent';
    if (event.conversation) setConversation(event.conversation);
    if (event.type === 'started') {
      setWorkingAgentId(event.agent.id);
      setMessages(current => event.conversation ? savedChatMessages(event.conversation) : [...current, { id, role: 'agent', agent: event.agent, text: '', streaming: true }]);
    } else if (event.type === 'messageDelta') {
      pieces.current.set(event.itemId, event.text);
      const text = [...pieces.current.values()].join('\n\n');
      setMessages(current => current.map(message => message.id === id ? { ...message, text } : message));
    } else {
      busy.current = false; setRunning(false); setWorkingAgentId(null);
      setMessages(current => {
        if (event.conversation) return savedChatMessages(event.conversation);
        const updated = current.map(message => message.id === id ? { ...message, streaming: false, text: event.type === 'completed' ? event.text : message.text } : message);
        if (event.type === 'failed') return [...updated, { id: event.runId + ':error', role: 'error', text: event.message }];
        if (event.type === 'cancelled') return [...updated, { id: event.runId + ':stopped', role: 'error', text: 'Stopped.' }];
        return updated;
      });
      if (event.type === 'failed' && event.code === 'RUNTIME_NOT_READY') setRuntimeReady(false);
      identity.current = null;
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = window.flux.subscribeSingleAgentEvents(receive);
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = async (): Promise<void> => {
      try {
        const result = await window.flux.getCodexRuntimeState();
        if (!disposed) setRuntimeReady(result.ok && !result.value.activity && result.value.state.operationalStatus === 'READY' && result.value.state.verificationStatus === 'passed');
      } catch { if (!disposed) setRuntimeReady(false); }
      if (!disposed) timer = setTimeout(() => void check(), 3000);
    };
    void check();
    return () => { mounted.current = false; disposed = true; clearTimeout(timer); unsubscribe(); };
  }, [receive]);
  const send = useCallback((input: SingleAgentInput): boolean => {
    if (busy.current || !runtimeReady || !input.prompt.trim()) return false;
    busy.current = true; accepting.current = true; queued.current = []; pieces.current.clear();
    setRunning(true);
    const currentGeneration = generation.current;
    setMessages(current => [...current, { id: crypto.randomUUID(), role: 'user', text: input.prompt.trim() }]);
    const failToStart = (message: string): void => {
      busy.current = false; accepting.current = false; queued.current = []; setRunning(false);
      setMessages(current => [...current, { id: crypto.randomUUID(), role: 'error', text: message }]);
    };
    void (async () => {
      try {
        const result = await window.flux.startSingleAgentTurn(input);
        if (!mounted.current || currentGeneration !== generation.current) return;
        if (!result.ok) { failToStart(result.error.message); return; }
        identity.current = result.value; accepting.current = false;
        const events = queued.current; queued.current = [];
        events.forEach(receive);
      } catch {
        if (!mounted.current || currentGeneration !== generation.current) return;
        failToStart('Codex could not start. Please try again.');
      }
    })();
    return true;
  }, [runtimeReady, receive]);
  const stop = useCallback((): void => {
    if (!busy.current) return;
    void window.flux.cancelSingleAgentTurn().then(result => { if (!result.ok) throw new Error('Cancel failed'); }).catch(() => {
      if (mounted.current) setMessages(current => [...current, { id: crypto.randomUUID(), role: 'error', text: 'Could not stop the turn. Please try Stop again.' }]);
    });
  }, []);
  const reset = useCallback((): void => {
    const next = ++generation.current;
    busy.current = true; accepting.current = false; identity.current = null; queued.current = []; pieces.current.clear();
    setMessages([]); setConversation(null); setConversationError(null); setOpening(false); setWorkingAgentId(null); setRunning(true);
    void window.flux.resetSingleAgentConversation().then(result => {
      if (!result.ok) throw new Error('Could not start a new conversation. Please try New task again.');
    }).catch(() => {
      if (mounted.current && generation.current === next) setMessages([{ id: crypto.randomUUID(), role: 'error', text: 'Could not start a new conversation. Please try New task again.' }]);
    }).finally(() => { if (mounted.current && generation.current === next) { busy.current = false; setRunning(false); } });
  }, []);
  const openConversation = useCallback(async (id: string, prepareWorkspace: (conversation: ConversationDetail, isCurrent: () => boolean) => Promise<boolean>): Promise<boolean> => {
    if (accepting.current || opening) return false;
    const version = ++generation.current;
    busy.current = true; accepting.current = true; queued.current = []; setOpening(true); setConversationError(null);
    try {
      const result = await window.flux.openConversation(id);
      const isCurrent = (): boolean => mounted.current && version === generation.current;
      if (!isCurrent()) return false;
      if (!result.ok) { setConversationError(result.error.message); return false; }
      const prepared = await prepareWorkspace(result.value.conversation, isCurrent);
      if (!isCurrent()) return false;
      if (!prepared) {
        if (!result.value.activeRun) { await window.flux.resetSingleAgentConversation(); setConversation(null); setMessages([]); identity.current = null; setRunning(false); }
        setConversationError('The conversation project could not be opened.'); return false;
      }
      if (!mounted.current || version !== generation.current) return false;
      const value = result.value;
      setConversation(value.conversation); setMessages(savedChatMessages(value.conversation));
      pieces.current.clear(); identity.current = value.activeRun;
      setWorkingAgentId(value.activeRun ? value.conversation.leadAgentId : null); setRunning(!!value.activeRun); busy.current = !!value.activeRun;
      accepting.current = false; const events = queued.current; queued.current = []; events.forEach(receive);
      return true;
    } catch { if (mounted.current && version === generation.current) setConversationError('The conversation could not be opened.'); return false; }
    finally {
      if (version === generation.current) {
        accepting.current = false;
        const events = queued.current; queued.current = []; events.forEach(receive);
        busy.current = identity.current !== null; setOpening(false);
      }
    }
  }, [opening, receive]);
  return { messages, running, opening, conversation, conversationError, workingAgentId, runtimeReady, send, stop, reset, openConversation };
}
