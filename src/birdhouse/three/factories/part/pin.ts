import { Color, CylinderGeometry } from 'three';
import { PALETTE } from '../../registry/palette';
import { edgesOf, paintUniform, type PartGeometry } from '../geometry';
import type { Plank } from '../../../model';

/** Nombre de facettes du cylindre : assez rond pour un cure-dent de 2 mm, peu de triangles. */
const SEGMENTS = 16;

/** Cure-dent (goupille) : un vrai cylindre de diamètre `w` et de longueur `depth`, axe le long du z local (comme la boîte des autres pièces pleines). */
export function pinGeometry(p: Plank, t: number): PartGeometry {
  const g = new CylinderGeometry(p.w / 2, p.w / 2, p.depth ?? t, SEGMENTS);
  g.rotateX(Math.PI / 2); // l'axe du cylindre (y) devient z
  paintUniform(g, new Color(p.color ?? PALETTE.woodBlock));
  return { geo: g, edges: edgesOf(g) };
}
