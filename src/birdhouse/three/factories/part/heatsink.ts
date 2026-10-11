import { BoxGeometry, Color } from 'three';
import { PALETTE } from '../../registry/palette';
import { mergeColored, edgesOf, type Part, type PartGeometry } from '../geometry';
import type { Plank } from '../../../model';

/** Radiateur alu : semelle de 3 mm et 11 ailettes de 1,2 mm (z local : vers l'extérieur). */
export function heatsinkGeometry(p: Plank): PartGeometry {
  const parts: Part[] = [], c = new Color(p.color ?? PALETTE.aluminium), D = p.depth ?? 23;
  const base = new BoxGeometry(p.w, p.h, 3); base.translate(0, 0, -D / 2 + 1.5); parts.push({ g: base, c });
  const nF = 11;
  for (let i = 0; i < nF; i++) { const fin = new BoxGeometry(1.2, p.h, D - 3); fin.translate(-p.w / 2 + 0.6 + i * ((p.w - 1.2) / (nF - 1)), 0, 1.5); parts.push({ g: fin, c: c.clone().multiplyScalar(0.85) }); }
  const geo = mergeColored(parts);
  return { geo, edges: edgesOf(geo) };
}
