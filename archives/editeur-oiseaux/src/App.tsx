import { useEffect } from 'react';
import Panel from './ui/Panel';
import Viewport from './ui/Viewport';
import { useBird } from './store/bird';

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && (t as HTMLInputElement).type !== 'range' && (t as HTMLInputElement).type !== 'checkbox';

export default function App() {
  // raccourcis : Ctrl+Z annuler, Ctrl+Y / Ctrl+Maj+Z rétablir, Suppr supprimer la pièce, Échap désélectionner
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useBird.getState();
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) s.redo(); else s.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); s.redo(); return; }
      if (typing(e.target)) return;
      if (e.key === 'Delete' && s.selectedId) s.removePart(s.selectedId);
      if (e.key === 'Escape') s.select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-full w-full overflow-hidden bg-stone-100 text-stone-800">
      <Panel />
      <main className="min-w-0 flex-1">
        <Viewport />
      </main>
    </div>
  );
}
