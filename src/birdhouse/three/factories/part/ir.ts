import { BoxGeometry, Color } from 'three';
import type { Plank } from '../../../model';
import { PALETTE } from '../../registry/palette';
import { coloredPart, type Part, type PartGeometry } from '../geometry';

/** Carte de 4 LED infrarouges, côté LED vers −z. Avec `p.wood` : les LED ont la hauteur du bois traversé (carte contre le bois, bout des LED à fleur de l'autre face). */
export function irBoardGeometry(p: Plank): PartGeometry {
  const parts: Part[] = [];
  parts.push({ g: new BoxGeometry(p.w, p.h, 1.6), c: new Color(PALETTE.irBoard) });
  const hl = p.wood ?? 3.2, zc = p.wood === undefined ? -2.4 : -(0.8 + hl / 2);
  for (const dx of [-3, 3]) for (const dy of [-6, 6]) { const led = new BoxGeometry(3.2, 3.2, hl); led.translate(dx, dy, zc); parts.push({ g: led, c: new Color(PALETTE.irLed) }); }
  return coloredPart(parts);
}
