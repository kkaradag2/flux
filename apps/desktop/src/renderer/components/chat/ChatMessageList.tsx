import { useLayoutEffect, useRef } from 'react';
import type { ChatMessage } from '../../hooks/useSingleAgentChat';
import { AgentAvatar } from '../avatars/AgentAvatar';
import { MarkdownPreview } from '../markdown/MarkdownPreview';
export function ChatMessageList({ messages }: { messages: readonly ChatMessage[] }) {
  const list = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [messages]);
  return <div ref={list} className="chat-message-list" role="log" aria-label="Chat messages" aria-live="polite"><div className="chat-message-content">{messages.map(message => (
    <article className={message.role === 'user' ? 'user-message' : message.role === 'error' ? 'chat-error' : 'agent-message'} key={message.id}>
      {message.role === 'user' ? <><span className="message-author">You</span><p>{message.text}</p></> : message.role === 'error' ? <p>{message.text}</p> : <>
        <header className="agent-message-header">{message.agent && <AgentAvatar avatar={message.agent.avatar} size={24} />}<span>{message.agent?.name ?? 'Agent'}</span>{message.streaming && <span className="runtime-update-spinner" role="status" aria-label="Agent is working" />}</header>
        {message.text && <MarkdownPreview value={message.text} />}
        {message.streaming && <span className="streaming-caret" aria-hidden="true" />}
      </>}
    </article>
  ))}</div></div>;
}
