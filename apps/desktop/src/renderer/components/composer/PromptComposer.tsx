import { useLayoutEffect, useRef, useState } from 'react';
import { ComposerToolbar } from './ComposerToolbar';
import { ComposerContextBar } from './ComposerContextBar';
interface PromptComposerProps { onSend: (text: string) => void; focusOnMount?: boolean; placeholder?: string; }
export function PromptComposer({ onSend, focusOnMount = false, placeholder = 'Describe a task' }: PromptComposerProps) {
  const [text, setText] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => { if (focusOnMount) textarea.current?.focus(); }, [focusOnMount]);
  useLayoutEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = '0px';
    element.style.height = Math.min(Math.max(element.scrollHeight, 54), 180) + 'px';
    element.style.overflowY = element.scrollHeight > 180 ? 'auto' : 'hidden';
  }, [text]);
  const submit = (): void => {
    if (!text.trim()) return;
    onSend(text.trim()); setText(''); textarea.current?.focus();
  };
  return (
    <section className="composer-stack" aria-label="Task composer">
      <ComposerContextBar />
      <div className="prompt-composer">
        <textarea ref={textarea} aria-label="Task description" placeholder={placeholder} value={text} onChange={event => setText(event.target.value)} onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); submit(); }
        }} rows={2} spellCheck={false} />
        <ComposerToolbar sendDisabled={!text.trim()} onSend={submit} />
      </div>
    </section>
  );
}
