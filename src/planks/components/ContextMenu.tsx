import type { Plank, PlankScene } from '../model';

/** Menu du clic droit sur une plaque : trou, cacher / voir, cacher le groupe, délier. */
export function ContextMenu({ ctx, sc, hidden, groupSel, addHole, toggleHidden, update, setGroupSel, close }: {
  ctx: { x: number; y: number; plankId: string; local: [number, number] };
  sc: PlankScene; hidden: Set<string>; groupSel: string | null;
  addHole: (plankId: string, local: [number, number]) => void;
  toggleHidden: (ids: string[]) => void;
  update: (id: string, patch: Partial<Plank>, label?: string) => void;
  setGroupSel: (g: string | null) => void;
  close: () => void;
}) {
  return (
      <div className="absolute z-10 min-w-36 rounded-md border border-stone-200 bg-white py-1 text-xs shadow-lg" style={{ left: ctx.x, top: ctx.y }} onClick={(e) => e.stopPropagation()}>
        <button onClick={() => addHole(ctx.plankId, ctx.local)} className="block w-full px-3 py-1.5 text-left hover:bg-emerald-50">Trou…</button>
        <button onClick={() => { toggleHidden([ctx.plankId]); close(); }} className="block w-full px-3 py-1.5 text-left hover:bg-emerald-50">{hidden.has(ctx.plankId) ? 'Voir' : 'Cacher'}</button>
        {sc.planks.find((p) => p.id === ctx.plankId)?.group && (
          <button onClick={() => { const g = sc.planks.find((p) => p.id === ctx.plankId)?.group; if (g) toggleHidden(sc.planks.filter((p) => p.group === g).map((p) => p.id)); close(); }} className="block w-full px-3 py-1.5 text-left hover:bg-emerald-50">Cacher le groupe</button>
        )}
        {sc.planks.find((p) => p.id === ctx.plankId)?.group && (
          <button onClick={() => { const pl = sc.planks.find((p) => p.id === ctx.plankId); if (pl) { update(pl.id, { group: undefined }, 'Plaque déliée'); if (groupSel === pl.group) setGroupSel(null); } close(); }} className="block w-full px-3 py-1.5 text-left hover:bg-emerald-50">Délier cette plaque</button>
        )}
      </div>
  );
}
