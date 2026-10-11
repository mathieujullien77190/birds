import { Color, ExtrudeGeometry, Path, Shape, Vector2 } from 'three';
import { PALETTE } from '../../registry/palette';
import { edgesOf, paintUniform, type PartGeometry } from '../geometry';
import type { Plank } from '../../../model';
import { holeOutline } from '../../../model';

/** Pavé percé ou à contour libre : une plaque épaisse, épaisseur p.depth selon z. */
export function shapedBlockGeometry(p: Plank, t: number): PartGeometry {
  const shape = new Shape((p.poly ?? [[-p.w / 2, -p.h / 2], [p.w / 2, -p.h / 2], [p.w / 2, p.h / 2], [-p.w / 2, p.h / 2]]).map(([x, y]) => new Vector2(x, y)));
  for (const h of p.holes) shape.holes.push(new Path(holeOutline(h).map(([x, y]) => new Vector2(x, y))));
  const g = new ExtrudeGeometry(shape, { depth: p.depth ?? t, bevelEnabled: false }); g.translate(0, 0, -(p.depth ?? t) / 2);
  paintUniform(g, new Color(p.color ?? PALETTE.woodBlock));
  return { geo: g, edges: edgesOf(g) };
}
