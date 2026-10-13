import { BoxGeometry, Color } from 'three';
import { PALETTE } from '../../registry/palette';
import { mergeColored, edgesOf, type Part, type PartGeometry } from '../geometry';
import type { Plank } from '../../../model';

/** Module relais monocanal 3 V à optocoupleur (70 × 17 × 20 mm) : carte noire, relais bleu SRD-03VDC-SL-C au milieu, un bornier vert à 3 vis à chaque bout (signal VCC / GND / IN d'un côté, NO / COM / NC de l'autre), optocoupleur noir, LED. Long axe = y de la plaque ; le dessous de la carte est à −depth/2. */
export function relayGeometry(p: Plank): PartGeometry {
  const parts: Part[] = [], zb = -(p.depth ?? 20) / 2, top = zb + 1.6;
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: string) => { const g = new BoxGeometry(w, h, d); g.translate(x, y, z); parts.push({ g, c: new Color(c) }); };
  box(p.w, p.h, 1.6, 0, 0, zb + 0.8, p.color ?? PALETTE.slate); // carte
  box(15.5, 19, 15.3, 0, 0, top + 7.65, PALETTE.relayBlue); // relais SRD-03VDC-SL-C
  for (const s of [-1, 1]) box(p.w - 3, 10, 10, 0, s * (p.h / 2 - 6.5), top + 5, PALETTE.terminalGreen); // borniers à vis
  box(6.5, 4, 2, 0, p.h / 2 - 19, top + 1, PALETTE.slate); // optocoupleur EL817
  box(2, 1.4, 0.8, 5, -p.h / 2 + 19, top + 0.4, PALETTE.ledGreen); // LED d'état
  const geo = mergeColored(parts);
  return { geo, edges: edgesOf(geo) };
}
