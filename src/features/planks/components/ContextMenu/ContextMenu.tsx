import { Menu, MenuItem } from '@/ui';
import type { Plank, PlankScene } from '@/planks/model';
import type { ContextMenuState } from '../../types';

/** Menu du clic droit sur une plaque : trou, cacher / voir, cacher le groupe, délier. */
export function ContextMenu({ ctx, sc, hidden, groupSel, addHole, toggleHidden, update, setGroupSel, close }: {
  ctx: ContextMenuState;
  sc: PlankScene; hidden: Set<string>; groupSel: string | null;
  addHole: (plankId: string, local: [number, number]) => void;
  toggleHidden: (ids: string[]) => void;
  update: (id: string, patch: Partial<Plank>, label?: string) => void;
  setGroupSel: (g: string | null) => void;
  close: () => void;
}) {
  const plank = sc.planks.find((p) => p.id === ctx.plankId);
  return (
    <Menu x={ctx.x} y={ctx.y}>
      <MenuItem onClick={() => addHole(ctx.plankId, ctx.local)}>Trou…</MenuItem>
      <MenuItem onClick={() => { toggleHidden([ctx.plankId]); close(); }}>{hidden.has(ctx.plankId) ? 'Voir' : 'Cacher'}</MenuItem>
      {plank?.group && (
        <MenuItem onClick={() => { const g = plank.group; if (g) toggleHidden(sc.planks.filter((p) => p.group === g).map((p) => p.id)); close(); }}>Cacher le groupe</MenuItem>
      )}
      {plank?.group && (
        <MenuItem onClick={() => { update(plank.id, { group: undefined }, 'Plaque déliée'); if (groupSel === plank.group) setGroupSel(null); close(); }}>Délier cette plaque</MenuItem>
      )}
    </Menu>
  );
}
