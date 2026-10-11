import { BoxGeometry, Color } from 'three';
import { PALETTE } from '../../registry/palette';
import { edgesOf, paintUniform, type PartGeometry } from '../geometry';
import type { Plank } from '../../../model';

/** Pavé d'isolant : une boîte pleine. */
export function blockGeometry(p: Plank, t: number): PartGeometry {
  const g = new BoxGeometry(p.w, p.h, p.depth ?? t);
  paintUniform(g, new Color(p.color ?? PALETTE.insulation));
  return { geo: g, edges: edgesOf(g) };
}
