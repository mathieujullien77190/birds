import type { Dispatch, MouseEvent, SetStateAction } from 'react';
import { Eye, IconButton, NameEdit } from '@/ui';
import { plankSvg, type Plank } from '@/birdhouse/model';
import type { Hover } from '../../types';
import type { DropTarget } from './types';

/** Carte d'une plaque dans « Pièces » : nom (renommable), œil, dupliquer, supprimer, dessin à plat (ou bouton du document), glisser-déposer. */
export function PlankCard({ p, scale, selectedId, groupSel, extra, hidden, dropOn, setDropOn, setHover, setDocOpen, setGroupSel, pick, update, toggleHidden, duplicate, remove, dropPlank }: {
  p: Plank; scale: number; selectedId: string | null; groupSel: string | null; extra: Set<string>; hidden: Set<string>;
  dropOn: string | null; setDropOn: Dispatch<SetStateAction<string | null>>; setHover: (h: Hover | null) => void;
  setDocOpen: (d: string | null) => void; setGroupSel: (g: string | null) => void;
  pick: (id: string | null, ctrl: boolean) => void;
  update: (id: string, patch: Partial<Plank>, label?: string) => void;
  toggleHidden: (ids: string[]) => void; duplicate: (p: Plank) => void; remove: (id: string) => void;
  dropPlank: (id: string, target: DropTarget) => void;
}) {
  const pickPlank = (e: MouseEvent) => { pick(p.id, e.ctrlKey || e.metaKey); if (!(e.ctrlKey || e.metaKey)) setGroupSel(null); };
  const isHidden = hidden.has(p.id);
  return (
    <div
      data-pid={p.id}
      draggable={!p.group}
      onDragStart={(e) => { e.dataTransfer.setData('text/plank', p.id); e.dataTransfer.effectAllowed = 'move'; }}
      onDragOver={(e) => { if (!p.group && e.dataTransfer.types.includes('text/plank')) { e.preventDefault(); setDropOn(p.id); } }}
      onDragLeave={() => setDropOn((d) => (d === p.id ? null : d))}
      onDrop={(e) => { e.preventDefault(); dropPlank(e.dataTransfer.getData('text/plank'), { plank: p.id }); }}
      onMouseEnter={() => setHover({ plank: p.id })}
      onMouseLeave={() => setHover(null)}
      className={`rounded-lg border bg-white p-2 transition-colors hover:bg-amber-50 ${dropOn === p.id ? 'border-emerald-500 bg-emerald-50' : p.id === selectedId && !groupSel ? 'border-emerald-400' : extra.has(p.id) ? 'border-sky-400' : 'border-stone-200'} ${p.group ? '' : 'cursor-grab'}`}
      title={p.group ? undefined : 'Glisse cette plaque sur une boîte (ou une autre plaque) pour les grouper'}
    >
      <div className="mb-1 flex items-center gap-1 text-[11px]">
        <NameEdit value={p.name} active={p.id === selectedId && !groupSel} onSelect={pickPlank} onRename={(v) => update(p.id, { name: v }, 'Nom')} />
        <IconButton dim={isHidden} onClick={() => toggleHidden([p.id])} title={isHidden ? 'Afficher' : 'Cacher'}><Eye off={isHidden} /></IconButton>
        <IconButton onClick={() => duplicate(p)} title="Dupliquer">⧉</IconButton>
        <IconButton size="sm" onClick={() => remove(p.id)} title="Supprimer">×</IconButton>
      </div>
      {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="mb-1 block truncate text-[11px] text-sky-700 underline" title={p.url}>🔗 Fiche du composant</a>}
      {p.special === 'doc'
        ? <button onClick={() => setDocOpen('schema')} className="flex w-full items-center gap-2 rounded border border-sky-200 bg-sky-50 px-2 py-1.5 text-left text-[11px] font-semibold text-sky-900 hover:bg-sky-100">📄 Ouvrir le document <span className="ml-auto rounded bg-white px-1.5 py-0.5 text-[10px] font-normal text-sky-700">Document</span></button>
        : p.special
          ? <div className="py-2 text-center text-[11px] text-stone-500">Élément spécial : pas découpé (modèle 3D)</div>
          : <button onClick={pickPlank} className="flex w-full justify-center" dangerouslySetInnerHTML={{ __html: plankSvg(p, scale) }} />}
    </div>
  );
}
