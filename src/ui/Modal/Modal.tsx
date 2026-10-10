import type { ReactNode } from 'react';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { IconButton } from '../IconButton';

/** Fenêtre modale plein écran : fond sombre (clic dehors = ferme), en-tête avec croix, Échap ferme. `header` prend la place du titre à gauche de la croix. */
export function Modal({ header, onClose, maxWidth = 'max-w-6xl', children }: { header?: ReactNode; onClose: () => void; maxWidth?: string; children: ReactNode }) {
  useEscapeKey(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4" onClick={onClose}>
      <div className={`flex max-h-full w-full ${maxWidth} flex-col rounded-xl bg-white shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3">
          <div className="flex items-center gap-1">{header}</div>
          <IconButton size="lg" onClick={onClose} title="Fermer (Échap)">×</IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}
