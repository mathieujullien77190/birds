import { useCallback } from 'react';
import { usePersistentState } from '@/hooks';
import { STORAGE } from '../constants';

const parseHidden = (raw: string | null): Set<string> => { try { return new Set<string>(JSON.parse(raw ?? '[]')); } catch { return new Set<string>(); } };

/** Pièces cachées dans la 3D (œil du volet « Pièces »), gardées dans localStorage. `toggleHidden` : tout cacher, ou tout montrer si tout est déjà caché. */
export function useHiddenPlanks() {
  const [hidden, setHidden] = usePersistentState(STORAGE.hidden, parseHidden, (s) => JSON.stringify([...s]));
  const toggleHidden = useCallback((ids: string[]) => setHidden((h) => { const n = new Set(h); const allHidden = ids.every((i) => n.has(i)); for (const i of ids) { if (allHidden) n.delete(i); else n.add(i); } return n; }), [setHidden]);
  return { hidden, setHidden, toggleHidden };
}
