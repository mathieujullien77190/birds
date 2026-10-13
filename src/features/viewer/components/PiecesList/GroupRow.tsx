import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { Eye, IconButton, NameEdit } from '@/ui';
import type { Plank } from '@/birdhouse/model';
import type { Hover } from '../../types';
import type { DropTarget } from './types';

/** Ligne d'un groupe (boîte) dans « Pièces » : ▸ déplie, nom renommable (clic = choisit la boîte), œil, dupliquer, supprimer ; les cartes des plaques en `children` quand elle est dépliée. */
export function GroupRow({ g, name, members, open, isSelected, groupSel, hidden, dropOn, setDropOn, setHover, setOpenGroups, setSelectedId, setGroupSel, setExtra, toggleHidden, removeGroup, dropPlank, children }: {
  g: string; name: string; members: Plank[]; open: boolean; isSelected: boolean; groupSel: string | null; hidden: Set<string>;
  dropOn: string | null; setDropOn: Dispatch<SetStateAction<string | null>>; setHover: (h: Hover | null) => void;
  setOpenGroups: Dispatch<SetStateAction<Set<string>>>; setSelectedId: (id: string | null) => void; setGroupSel: (g: string | null) => void; setExtra: (e: Set<string>) => void;
  toggleHidden: (ids: string[]) => void;
  removeGroup: (g: string) => void; dropPlank: (id: string, target: DropTarget) => void;
  children: ReactNode;
}) {
  const allHidden = members.every((x) => hidden.has(x.id));
  return (
    <div
      onDragOver={(e) => { if (e.dataTransfer.types.includes('text/plank')) { e.preventDefault(); setDropOn(g); } }}
      onDragLeave={() => setDropOn((d) => (d === g ? null : d))}
      onDrop={(e) => { e.preventDefault(); dropPlank(e.dataTransfer.getData('text/plank'), { group: g }); }}
      className={`rounded-lg border bg-white ${dropOn === g ? 'border-emerald-500 bg-emerald-50' : isSelected ? 'border-emerald-400' : 'border-stone-200'}`}
    >
      <div onMouseEnter={() => setHover({ group: g })} onMouseLeave={() => setHover(null)} className="flex items-center gap-1 rounded-lg p-2 text-[11px] transition-colors hover:bg-amber-50">
        <button onClick={() => setOpenGroups((s) => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n; })} className="w-4 text-stone-400 hover:text-stone-700" title={open ? 'Replier' : 'Voir les plaques'}><span className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>▸</span></button>
        <NameEdit value={name} prefix="⛓ " active={groupSel === g} title="Choisir la boîte entière" onSelect={() => { setSelectedId(members[0].id); setGroupSel(g); setExtra(new Set()); }} />
        <IconButton dim={allHidden} onClick={() => toggleHidden(members.map((x) => x.id))} title={allHidden ? 'Tout afficher' : 'Tout cacher'}><Eye off={allHidden} /></IconButton>
        <IconButton size="sm" onClick={() => removeGroup(g)} title="Supprimer tout le groupe">×</IconButton>
      </div>
      {open && <div className="space-y-2 border-t border-stone-100 p-2 pl-4">{children}</div>}
    </div>
  );
}
