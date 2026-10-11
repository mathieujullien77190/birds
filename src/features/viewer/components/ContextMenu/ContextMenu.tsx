import { Menu, MenuItem } from '@/ui';
import type { PlankScene } from '@/birdhouse/model';
import type { ContextMenuState } from '../../types';

/** Menu du clic droit sur une plaque : cacher / voir la plaque, cacher son groupe. */
export function ContextMenu({ ctx, sc, hidden, toggleHidden, close }: {
  ctx: ContextMenuState;
  sc: PlankScene; hidden: Set<string>;
  toggleHidden: (ids: string[]) => void;
  close: () => void;
}) {
  const plank = sc.planks.find((p) => p.id === ctx.plankId);
  return (
    <Menu x={ctx.x} y={ctx.y}>
      <MenuItem onClick={() => { toggleHidden([ctx.plankId]); close(); }}>{hidden.has(ctx.plankId) ? 'Voir' : 'Cacher'}</MenuItem>
      {plank?.group && (
        <MenuItem onClick={() => { const g = plank.group; if (g) toggleHidden(sc.planks.filter((p) => p.group === g).map((p) => p.id)); close(); }}>Cacher le groupe</MenuItem>
      )}
    </Menu>
  );
}
