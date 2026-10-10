import type { Dispatch, SetStateAction } from 'react';
import { Btn, Chip, FloatingPanel, Slider } from '@/ui';
import { bounds, type PlankScene } from '@/planks/model';
import { AXIS_I, type Cut } from '@/planks/three/types';

/** Barre du plan de coupe (axe, côté gardé, position) en haut à droite de la vue. */
export function CutPanel({ cut, setCut, sc, midOf }: { cut: Cut; setCut: Dispatch<SetStateAction<Cut>>; sc: PlankScene; midOf: (axis: Cut['axis']) => number }) {
  const b = sc.planks.length ? bounds(sc.planks, sc.t) : { min: [0, 0, 0], max: [0, 0, 0] };
  const i = AXIS_I[cut.axis];
  return (
    <FloatingPanel tone="sky" className="absolute top-14 right-3 w-64 space-y-1.5 p-2 text-[11px] text-sky-900">
      <div className="flex items-center gap-1.5">
        Plan ⟂
        {(['x', 'y', 'z'] as const).map((ax) => <Chip key={ax} active={cut.axis === ax} onClick={() => setCut((c) => ({ ...c, axis: ax, pos: midOf(ax) }))}>{ax.toUpperCase()}</Chip>)}
        <Chip active={false} onClick={() => setCut((c) => ({ ...c, flip: !c.flip }))} title="Voir l'autre côté">⇄ autre côté</Chip>
      </div>
      <Slider label={`Position ${cut.axis.toUpperCase()}`} value={cut.pos} min={Math.floor(b.min[i]) - 10} max={Math.ceil(b.max[i]) + 10} step={1} unit=" mm" marks={[{ at: Math.round((b.min[i] + b.max[i]) / 2), label: 'milieu' }]} onChange={(pos) => setCut((c) => ({ ...c, pos }))} />
      <Btn block={false} variant="ghost" onClick={() => setCut((c) => ({ ...c, on: false }))}>Fermer la coupe</Btn>
    </FloatingPanel>
  );
}
