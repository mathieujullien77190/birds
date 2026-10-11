import { useState } from 'react';
import { Eye, IconButton } from '@/ui';
import type { PlankScene } from '@/birdhouse/model';
import { partsRows } from './helpers';

/** Menu de droite du téléphone, simplifié : la liste des groupes et des pièces avec un seul geste, afficher / cacher (œil). Toucher un nom le choisit dans la 3D. */
export function PartsSheet({ sc, hidden, toggleHidden, setHidden, onPick, onClose }: {
  sc: PlankScene; hidden: Set<string>; toggleHidden: (ids: string[]) => void; setHidden: (s: Set<string>) => void;
  onPick: (id: string, group: string | null) => void; onClose: () => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const rows = partsRows(sc);
  const flip = (key: string) => setOpen((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  return (
    <aside className="absolute inset-y-0 right-0 z-20 flex w-[min(20rem,85vw)] flex-col border-l border-stone-200 bg-stone-50 shadow-lg">
      <div className="flex items-center gap-2 border-b border-stone-200 px-3 py-2">
        <h2 className="flex-1 text-sm font-semibold text-emerald-900">Pièces</h2>
        <button type="button" onClick={() => setHidden(new Set())} className="rounded bg-white px-2 py-1 text-xs font-medium text-stone-700 ring-1 ring-stone-200">Tout afficher</button>
        <IconButton size="md" onClick={onClose} title="Fermer">×</IconButton>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto py-1">
        {rows.map((r) => {
          const allHidden = r.ids.every((i) => hidden.has(i));
          const some = !allHidden && r.ids.some((i) => hidden.has(i));
          const expanded = open.has(r.key);
          return (
            <li key={r.key}>
              <div className="flex items-center gap-1 px-2 py-1.5">
                {r.group ? <button type="button" onClick={() => flip(r.key)} className="w-6 text-stone-500" aria-label={expanded ? 'Replier' : 'Déplier'}>{expanded ? '▾' : '▸'}</button> : <span className="w-6" />}
                <button type="button" onClick={() => onPick(r.ids[0], r.group)} className={`min-w-0 flex-1 truncate text-left text-sm ${allHidden ? 'text-stone-400' : 'text-stone-800'}`}>
                  {r.name}{r.group && <span className="ml-1 text-[11px] text-stone-400">{r.ids.length}</span>}{some && <span className="ml-1 text-[11px] text-amber-600">partiel</span>}
                </button>
                <IconButton dim={allHidden} onClick={() => toggleHidden(r.ids)} title={allHidden ? 'Afficher' : 'Cacher'} className="p-2"><Eye off={allHidden} /></IconButton>
              </div>
              {r.group && expanded && (
                <ul className="ml-5 border-l border-stone-200 pl-4">
                  {r.members.map((p) => (
                    <li key={p.id} className="flex items-center gap-1 px-1 py-1">
                      <button type="button" onClick={() => onPick(p.id, null)} className={`min-w-0 flex-1 truncate text-left text-xs ${hidden.has(p.id) ? 'text-stone-400' : 'text-stone-700'}`}>{p.name}</button>
                      <IconButton dim={hidden.has(p.id)} onClick={() => toggleHidden([p.id])} title={hidden.has(p.id) ? 'Afficher' : 'Cacher'} className="p-1.5"><Eye off={hidden.has(p.id)} /></IconButton>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
