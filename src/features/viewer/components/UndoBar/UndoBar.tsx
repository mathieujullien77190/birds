import { FloatingPanel } from '@/ui';

/** Bouton « ↶ Retour » en haut à gauche de la vue (Ctrl+Z fait pareil) ; affiche l'action qui sera annulée. */
export function UndoBar({ backLabel, onBack }: { backLabel: string | null; onBack: () => void }) {
  return (
    <FloatingPanel className="absolute top-3 left-3 flex items-center gap-1 p-1">
      <button onClick={onBack} disabled={!backLabel} title={backLabel ? `Annuler : ${backLabel} (Ctrl+Z)` : 'Rien à annuler'} className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold text-stone-800 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40">
        <span aria-hidden className="text-sm leading-none">↶</span> Retour
        {backLabel && <span className="max-w-40 truncate text-[10px] font-normal text-stone-500">{backLabel}</span>}
      </button>
    </FloatingPanel>
  );
}
