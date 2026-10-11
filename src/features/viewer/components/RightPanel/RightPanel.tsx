import type { ReactNode } from 'react';
import { CollapseButton, SidePanel } from '@/ui';

/** Panneau de droite : la liste des pièces ; ▸ dans l'en-tête le replie, la languette ◂ sur le bord droit le rouvre. */
export function RightPanel({ open, setOpen, piecesCount, pieces }: { open: boolean; setOpen: (o: boolean) => void; piecesCount: number; pieces: ReactNode }) {
  return (
    <SidePanel side="right" open={open} onOpen={() => setOpen(true)} openTitle="Ouvrir le panneau de droite" width="w-[20rem]">
      <div className="flex items-center gap-2 border-b border-stone-200 px-2 py-1">
        <CollapseButton onClick={() => setOpen(false)} title="Replier le panneau de droite">▸</CollapseButton>
        <h2 className="flex-1 text-sm font-semibold text-emerald-900">Pièces</h2>
        <span className="text-[10px] text-stone-400">{piecesCount}</span>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2">{pieces}</div>
    </SidePanel>
  );
}
