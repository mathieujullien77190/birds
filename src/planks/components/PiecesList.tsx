import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { Btn, Hint } from '@/ui/kit';
import { plankSvg, type Plank, type PlankScene } from '../model';
import { Eye } from './Eye';
import { NameEdit } from './NameEdit';

export interface PiecesListProps {
  sc: PlankScene;
  selectedId: string | null;
  selected: Plank | null;
  groupSel: string | null;
  extra: Set<string>;
  hidden: Set<string>;
  openGroups: Set<string>;
  setOpenGroups: Dispatch<SetStateAction<Set<string>>>;
  dropOn: string | null;
  setDropOn: Dispatch<SetStateAction<string | null>>;
  setHover: (h: { plank?: string; group?: string } | null) => void;
  confirmAll: boolean;
  docOpen: string | null;
  setDocOpen: (d: string | null) => void;
  setSelectedId: (id: string | null) => void;
  setGroupSel: (g: string | null) => void;
  setExtra: (e: Set<string>) => void;
  pick: (id: string | null, ctrl: boolean) => void;
  update: (id: string, patch: Partial<Plank>, label?: string) => void;
  commit: (label: string, next: (s: PlankScene) => PlankScene, merge?: boolean) => void;
  toggleHidden: (ids: string[]) => void;
  duplicate: (p: Plank) => void;
  remove: (id: string) => void;
  duplicateGroup: (g: string) => void;
  removeGroup: (g: string) => void;
  removeAll: () => void;
  dropPlank: (id: string, target: { group?: string; plank?: string }) => void;
}

/** Contenu du volet « Pièces » : chaque plaque à plat (ou ligne de groupe repliable), glisser-déposer, œil, renommer, dupliquer, supprimer. */
export function PiecesList({ sc, selectedId, selected, groupSel, extra, hidden, openGroups, setOpenGroups, dropOn, setDropOn, setHover, confirmAll, docOpen, setDocOpen, setSelectedId, setGroupSel, setExtra, pick, update, commit, toggleHidden, duplicate, remove, duplicateGroup, removeGroup, removeAll, dropPlank }: PiecesListProps) {
  if (!sc.planks.length) return <Hint>Aucune plaque.</Hint>;
  const widest = Math.max(...sc.planks.map((p) => p.w + 8));
  const scale = Math.min(1.2, 216 / widest);
  const card = (p: Plank) => (
    <div
      key={p.id}
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
        <NameEdit value={p.name} active={p.id === selectedId && !groupSel} onSelect={(e) => { pick(p.id, e.ctrlKey || e.metaKey); if (!(e.ctrlKey || e.metaKey)) setGroupSel(null); }} onRename={(v) => update(p.id, { name: v }, 'Nom')} />
        <button onClick={() => toggleHidden([p.id])} title={hidden.has(p.id) ? 'Afficher' : 'Cacher'} className={`rounded px-1 ${hidden.has(p.id) ? 'text-stone-300' : 'text-stone-400'} hover:bg-stone-200 hover:text-stone-700`}><Eye off={hidden.has(p.id)} /></button>
        <button onClick={() => duplicate(p)} title="Dupliquer" className="rounded px-1 text-stone-400 hover:bg-stone-200 hover:text-stone-700">⧉</button>
        <button onClick={() => remove(p.id)} title="Supprimer" className="rounded px-1 text-sm text-stone-400 hover:bg-stone-200 hover:text-stone-700">×</button>
      </div>
      {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="mb-1 block truncate text-[11px] text-sky-700 underline" title={p.url}>🔗 Fiche du composant</a>}
      {p.special === 'doc' ? <button onClick={() => setDocOpen('schema')} className="flex w-full items-center gap-2 rounded border border-sky-200 bg-sky-50 px-2 py-1.5 text-left text-[11px] font-semibold text-sky-900 hover:bg-sky-100">📄 Ouvrir le document <span className="ml-auto rounded bg-white px-1.5 py-0.5 text-[10px] font-normal text-sky-700">Document</span></button> : p.special ? <div className="py-2 text-center text-[11px] text-stone-500">Élément spécial : pas découpé (modèle 3D)</div> : <button onClick={(e) => { pick(p.id, e.ctrlKey || e.metaKey); if (!(e.ctrlKey || e.metaKey)) setGroupSel(null); }} className="flex w-full justify-center" dangerouslySetInnerHTML={{ __html: plankSvg(p, scale) }} />}
    </div>
  );
  // les plaques liées sont rangées sous une seule ligne (boîte, groupe) qui se déplie
  const seen = new Set<string>();
  const rows: ReactNode[] = [];
  for (const p of sc.planks) {
    if (!p.group) { rows.push(card(p)); continue; }
    if (seen.has(p.group)) continue;
    seen.add(p.group);
    const g = p.group, members = sc.planks.filter((x) => x.group === g), open = openGroups.has(g);
    const isDoc = members.every((x) => x.special === 'doc'); // le document : son œil l'affiche ou le ferme
    const face = members.map((m) => /^Face avant (\d+)/.exec(m.name)).find(Boolean); // boîte créée avant que son nom soit enregistré
    const name = (sc.groupNames?.[g] ?? (face ? `Boîte ${face[1]}` : 'Groupe')).replace(/ \(.*\)$/, '');
    rows.push(
      <div
        key={'g' + g}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('text/plank')) { e.preventDefault(); setDropOn(g); } }}
        onDragLeave={() => setDropOn((d) => (d === g ? null : d))}
        onDrop={(e) => { e.preventDefault(); dropPlank(e.dataTransfer.getData('text/plank'), { group: g }); }}
        className={`rounded-lg border bg-white ${dropOn === g ? 'border-emerald-500 bg-emerald-50' : selected?.group === g ? 'border-emerald-400' : 'border-stone-200'}`}
      >
        <div onMouseEnter={() => setHover({ group: g })} onMouseLeave={() => setHover(null)} className="flex items-center gap-1 rounded-lg p-2 text-[11px] transition-colors hover:bg-amber-50">
          <button onClick={() => setOpenGroups((s) => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n; })} className="w-4 text-stone-400 hover:text-stone-700" title={open ? 'Replier' : 'Voir les plaques'}><span className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>▸</span></button>
          <NameEdit value={name} prefix="⛓ " active={groupSel === g} title="Choisir la boîte entière · clique à nouveau pour renommer" onSelect={() => { if (isDoc) { setDocOpen(docOpen ? null : 'schema'); return; } setSelectedId(members[0].id); setGroupSel(g); setExtra(new Set()); }} onRename={(v) => commit('Nom du groupe', (s) => ({ ...s, groupNames: { ...(s.groupNames ?? {}), [g]: v } }))} />
          {!isDoc && <button onClick={() => toggleHidden(members.map((x) => x.id))} title={members.every((x) => hidden.has(x.id)) ? 'Tout afficher' : 'Tout cacher'} className={`rounded px-1 ${members.every((x) => hidden.has(x.id)) ? 'text-stone-300' : 'text-stone-400'} hover:bg-stone-200 hover:text-stone-700`}><Eye off={members.every((x) => hidden.has(x.id))} /></button>}
          {!isDoc && <button onClick={() => duplicateGroup(g)} title="Dupliquer la boîte" className="rounded px-1 text-stone-400 hover:bg-stone-200 hover:text-stone-700">⧉</button>}
          <button onClick={() => removeGroup(g)} title="Supprimer tout le groupe" className="rounded px-1 text-sm text-stone-400 hover:bg-stone-200 hover:text-stone-700">×</button>
        </div>
        {open && <div className="space-y-2 border-t border-stone-100 p-2 pl-4">{members.map((m) => card(m))}</div>}
      </div>,
    );
  }
  return [<Btn key="all" variant={confirmAll ? 'danger' : 'secondary'} onClick={removeAll}>{confirmAll ? `Cliquer encore pour tout supprimer (${sc.planks.length})` : `Tout supprimer (${sc.planks.length})`}</Btn>, ...rows];
}
