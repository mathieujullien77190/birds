import { Color, CylinderGeometry, TorusGeometry } from 'three';
import { PALETTE } from '../../registry/palette';
import { edgesOf, mergeColored, type Part, type PartGeometry } from '../geometry';
import type { Plank } from '../../../model';

const WIRE_D = 1.2; // diamètre du fil d'acier
const RINGS = 5; // anneaux concentriques
const EYE_R = 2.2; // rayon (à l'axe du fil) d'un œillet de fixation

/**
 * Grille de protection de ventilateur en fil d'acier (type Noctua NA-FG1-6) : cinq anneaux concentriques, deux fils en croix
 * qui vont de l'anneau central aux quatre œillets de fixation, placés aux coins (entraxe des vis du ventilateur, 25 mm à 30 mm du centre).
 * `w` = côté du ventilateur ; la grille est à plat dans le plan xy de la plaque, l'épaisseur du dessin = le fil.
 */
export function guardGeometry(p: Plank): PartGeometry {
  const parts: Part[] = [], c = new Color(p.color ?? PALETTE.slate), r = WIRE_D / 2, hole = p.w * 0.4167; // 25 mm pour 60 mm
  const outer = p.w * 0.46, inner = p.w * 0.075;
  for (let i = 0; i < RINGS; i++) parts.push({ g: new TorusGeometry(inner + (i * (outer - inner)) / (RINGS - 1), r, 6, 48), c });
  const len = Math.hypot(hole, hole);
  for (const s of [1, -1]) { // les deux diagonales
    const bar = new CylinderGeometry(r, r, 2 * len, 6); bar.rotateZ(Math.PI / 2 + s * (Math.PI / 4)); parts.push({ g: bar, c });
  }
  for (const sx of [1, -1]) for (const sy of [1, -1]) { const eye = new TorusGeometry(EYE_R, r, 6, 16); eye.translate(sx * hole, sy * hole, 0); parts.push({ g: eye, c }); }
  const geo = mergeColored(parts);
  return { geo, edges: edgesOf(geo) };
}
