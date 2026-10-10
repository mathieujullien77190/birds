import { useEffect, useRef } from 'react';

/** Appelle `handler` quand on appuie sur Échap (le dernier `handler` passé est toujours utilisé). */
export function useEscapeKey(handler: () => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') ref.current(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
}
