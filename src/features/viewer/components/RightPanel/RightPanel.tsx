import type { ReactNode } from 'react';
import { CollapseButton, Drawer, SidePanel } from '@/ui';
import type { DrawerId } from '../../types';

/** Panneau de droite : deux volets empilés (« Pièces » et « Historique », un seul ouvert à la fois) ; ▸ dans l'en-tête le replie, la languette ◂ sur le bord droit le rouvre. */
export function RightPanel({ open, setOpen, drawer, setDrawer, piecesCount, historyCount, pieces, history }: {
  open: boolean; setOpen: (o: boolean) => void;
  drawer: DrawerId | null; setDrawer: (d: DrawerId | null) => void;
  piecesCount: number; historyCount: number; pieces: ReactNode; history: ReactNode;
}) {
  return (
    <SidePanel side="right" open={open} onOpen={() => setOpen(true)} openTitle="Ouvrir le panneau de droite" width="w-[20rem]">
      <div className="flex justify-start border-b border-stone-200 px-2 py-1">
        <CollapseButton onClick={() => setOpen(false)} title="Replier le panneau de droite">▸</CollapseButton>
      </div>
      <Drawer title="Pièces" note={`${piecesCount}`} open={drawer === 'pieces'} onToggle={() => setDrawer(drawer === 'pieces' ? null : 'pieces')}>
        {pieces}
      </Drawer>
      <Drawer title="Historique" note={`${historyCount}`} open={drawer === 'history'} onToggle={() => setDrawer(drawer === 'history' ? null : 'history')}>
        {history}
      </Drawer>
    </SidePanel>
  );
}
