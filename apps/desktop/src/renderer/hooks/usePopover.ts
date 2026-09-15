import { useEffect, useRef, useState } from 'react';
export function usePopover() {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = (restoreFocus = false): void => { setOpen(false); if (restoreFocus) trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    container.current?.querySelector<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)')?.focus();
    const outside = (event: PointerEvent): void => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        const items = Array.from(container.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ?? []);
        if (!items.length) return;
        event.preventDefault();
        const index = items.findIndex(item => item === document.activeElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
        items[next]?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  return { open, setOpen, close, container, trigger };
}
