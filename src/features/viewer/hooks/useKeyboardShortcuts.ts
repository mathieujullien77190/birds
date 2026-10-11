import { useEffect, type MutableRefObject } from 'react';
import type { PlankScene } from '@/birdhouse/model';
import type { Commit } from '../types';

/** Raccourcis : Suppr / Retour arrière supprime la plaque (ou la boîte) choisie, Ctrl+Z = Retour, Échap ferme menu, fenêtre de trou, sélection multiple et tirage de face. */
export function useKeyboardShortcuts(refs: {
  back: MutableRefObject<() => void>;
  commit: MutableRefObject<Commit>;
  selectedId: MutableRefObject<string | null>;
  groupSel: MutableRefObject<string | null>;
}, on: { clearSelection: () => void; escape: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); refs.back.current(); }
      if ((e.key === 'Delete' || (e.key === 'Backspace' && !typing)) && !typing && refs.selectedId.current) {
        e.preventDefault();
        const id = refs.selectedId.current, g = refs.groupSel.current;
        if (g) refs.commit.current('Boîte supprimée', (s: PlankScene) => ({ ...s, planks: s.planks.filter((p) => p.group !== g) }));
        else refs.commit.current('Plaque supprimée', (s: PlankScene) => ({ ...s, planks: s.planks.filter((p) => p.id !== id) }));
        on.clearSelection();
      }
      if (e.key === 'Escape') on.escape();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
