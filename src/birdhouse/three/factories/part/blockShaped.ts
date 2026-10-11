import { Color, ExtrudeGeometry, Path, Shape, Vector2 } from 'three';
import { PALETTE } from '../../registry/palette';
import { edgesOf, paintUniform, type PartGeometry } from '../geometry';
import type { Plank } from '../../../model';
import { holeOutline } from '../../../model';

/** Pavé percé (lambris à l'entrée) ou à contour libre (lames qui montent en diagonale) : une plaque épaisse, épaisseur p.depth selon z. */
export function shapedBlockGeometry(p: Plank, t: number): PartGeometry {
  const shape = new Shape((p.poly ?? [[-p.w / 2, -p.h / 2], [p.w / 2, -p.h / 2], [p.w / 2, p.h / 2], [-p.w / 2, p.h / 2]]).map(([x, y]) => new Vector2(x, y)));
  for (const h of p.holes) shape.holes.push(new Path(holeOutline(h).map(([x, y]) => new Vector2(x, y))));
  const g = new ExtrudeGeometry(shape, { depth: p.depth ?? t, bevelEnabled: false }); g.translate(0, 0, -(p.depth ?? t) / 2);
  if (p.top) { // le haut du prisme suit un plan incliné : on remonte les sommets du dessus sur ce plan (les arêtes restent verticales)
    const pos = g.attributes.position, hz = (p.depth ?? t) / 2;
    for (let i = 0; i < pos.count; i++) if (pos.getZ(i) > hz - 1e-6) pos.setZ(i, p.top.z0 + p.top.bx * pos.getX(i) + p.top.by * pos.getY(i));
    g.computeVertexNormals();
  }
  paintUniform(g, new Color(p.color ?? PALETTE.woodBlock));
  return { geo: g, edges: edgesOf(g) };
}
