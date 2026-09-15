import { ExecutionPlanCard } from './ExecutionPlanCard';
import type { ConversationOrchestrationView } from '../../../shared/orchestration-api';
import { useLayoutEffect, useRef } from 'react';
import type { ChatMessage } from '../../hooks/useSingleAgentChat';
import { AgentAvatar } from '../avatars/AgentAvatar';
import { MarkdownPreview } from '../markdown/MarkdownPreview';
export function ChatMessageList({ messages, orchestration, planningName }: { messages: readonly ChatMessage[]; orchestration?: ConversationOrchestrationView | null; planningName?: string | null }) {
  const list = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [messages, orchestration, planningName]);
  return <div ref={list} className="chat-message-list" role="log" aria-label="Chat messages" aria-live="polite"><div className="chat-message-content">{messages.map(message => (
    <article className={message.role === 'user' ? 'user-message' : message.role === 'error' ? 'chat-error' : 'agent-message'} key={message.id}>
      {message.role === 'user' ? <><span className="message-author">You</span><p>{message.text}</p></> : message.role === 'error' ? <p>{message.text}</p> : <>
        <header className="agent-message-header">{message.agent && <AgentAvatar avatar={message.agent.avatar} size={24} />}<span>{message.agent?.name ?? 'Agent'}</span>{message.streaming && <span className="runtime-update-spinner" role="status" aria-label="Agent is working" />}</header>
        {message.text && <MarkdownPreview value={message.text} />}
        {message.planRunId && orchestration?.run?.id === message.planRunId && <ExecutionPlanCard view={orchestration} />}
        {message.streaming && <span className="streaming-caret" aria-hidden="true" />}
      </>}
    </article>
  ))}{planningName && <div className="planning-activity" role="status"><span className="runtime-update-spinner" />{planningName} is planning…</div>}</div></div>;
}
