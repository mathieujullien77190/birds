import type { ReactNode } from 'react';

/** Volet du panneau de droite : un titre-bouton toujours visible, le contenu déroulé dessous prend la place et défile. Un seul volet ouvert à la fois (onglets verticaux). */
export function Drawer({ title, note, open, onToggle, children }: { title: string; note?: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className={`flex min-h-0 flex-col border-b border-stone-200 ${open ? 'flex-1' : ''}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-semibold text-emerald-900 select-none hover:bg-stone-100/70">
        <span className="flex items-center gap-1.5"><span aria-hidden className={`inline-block w-3 text-stone-400 transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>{title}</span>
        {note && <span className="text-[10px] font-normal text-stone-400">{note}</span>}
      </button>
      {open && <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">{children}</div>}
    </div>
  );
}
