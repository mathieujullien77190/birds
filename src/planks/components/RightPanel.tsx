import type { ReactNode } from 'react';
import { Drawer } from './Drawer';

/** Panneau de droite : deux volets empilés (« Pièces » et « Historique », un seul ouvert à la fois) ; ▸ dans l'en-tête le replie, la languette ◂ sur le bord droit le rouvre. */
export function RightPanel({ open, setOpen, drawer, setDrawer, piecesCount, historyCount, pieces, history }: {
  open: boolean; setOpen: (o: boolean) => void;
  drawer: 'pieces' | 'history' | null; setDrawer: (d: 'pieces' | 'history' | null) => void;
  piecesCount: number; historyCount: number; pieces: ReactNode; history: ReactNode;
}) {
  if (!open) return <button onClick={() => setOpen(true)} title="Ouvrir le panneau de droite" className="flex h-full w-7 shrink-0 items-start justify-center border-l border-stone-200 bg-stone-50 pt-3 text-stone-500 hover:bg-stone-100">◂</button>;
  return (
    <aside className="flex h-full w-[20rem] shrink-0 flex-col border-l border-stone-200 bg-stone-50">
      <div className="flex justify-start border-b border-stone-200 px-2 py-1">
        <button onClick={() => setOpen(false)} title="Replier le panneau de droite" className="rounded-md border border-stone-300 bg-white px-2 py-1 text-xs text-stone-600 hover:bg-stone-100">▸</button>
      </div>
      <Drawer title="Pièces" note={`${piecesCount}`} open={drawer === 'pieces'} onToggle={() => setDrawer(drawer === 'pieces' ? null : 'pieces')}>
        {pieces}
      </Drawer>
      <Drawer title="Historique" note={`${historyCount}`} open={drawer === 'history'} onToggle={() => setDrawer(drawer === 'history' ? null : 'history')}>
        {history}
      </Drawer>
    </aside>
  );
}
