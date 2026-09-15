import { useLayoutEffect, useRef } from 'react';
import type { UserMessage } from '../../state/WorkspaceContext';
export function ChatMessageList({ messages }: { messages: readonly UserMessage[] }) {
  const list = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [messages]);
  return <div ref={list} className="chat-message-list" role="log" aria-label="Chat messages" aria-live="polite"><div className="chat-message-content">{messages.map(message => <article className="user-message" key={message.id}><span className="message-author">You</span><p>{message.text}</p></article>)}</div></div>;
}
