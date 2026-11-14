'use client';
import { useEffect, useRef } from 'react';
export function useDialogFocus(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const items = () => Array.from(node?.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex="0"]') || []);
    items()[0]?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') {
        const all = items(); const first = all[0]; const last = all[all.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    node?.addEventListener('keydown', handler);
    return () => { node?.removeEventListener('keydown', handler); previous?.focus(); };
  }, [open, close]);
  return ref;
}
