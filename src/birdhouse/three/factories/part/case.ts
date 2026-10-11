import { BoxGeometry, Color } from 'three';
import type { Plank } from '../../../model';
import { PART } from '../../constants';
import { PALETTE } from '../../registry/palette';
import { coloredPart, type Part, type PartGeometry } from '../geometry';

/** Boîtier étanche du Pi : fond, quatre parois, couvercle (plaques minces). Origine : milieu du fond. */
export function caseGeometry(p: Plank): PartGeometry {
  const W = p.w, D = p.h, H = PART.caseHeight, w = PART.caseWall;
  const parts: Part[] = [];
  const slab = (sx: number, sy: number, sz: number, x: number, y: number, z: number, c: string = PALETTE.aluminium) => { const g = new BoxGeometry(sx, sy, sz); g.translate(x, y, z); parts.push({ g, c: new Color(c) }); };
  slab(W, D, w, 0, 0, w / 2); // fond
  slab(W, D, w, 0, 0, H - w / 2); // couvercle
  slab(W, w, H - 2 * w, 0, -(D - w) / 2, H / 2); slab(W, w, H - 2 * w, 0, (D - w) / 2, H / 2); // avant, arrière
  slab(w, D - 2 * w, H - 2 * w, -(W - w) / 2, 0, H / 2); slab(w, D - 2 * w, H - 2 * w, (W - w) / 2, 0, H / 2); // gauche, droite
  return coloredPart(parts);
}
