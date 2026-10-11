import { BoxGeometry, Color } from 'three';
import { PALETTE } from '../../registry/palette';
import { mergeColored, edgesOf, type Part, type PartGeometry } from '../geometry';
import type { Plank } from '../../../model';

/** Carte du capteur : circuit bleu, puce blanche à grille noire (côté +z local = vers le nid), quatre broches dorées. */
export function sensorGeometry(p: Plank): PartGeometry {
  const parts: Part[] = [];
  parts.push({ g: new BoxGeometry(p.w, p.h, 1.6), c: new Color(PALETTE.sensorBlue) });
  const ch = p.wood ?? 1.6, chipZ = p.wood === undefined ? 1.6 : 0.8 + ch / 2; // avec `wood` : la puce a la hauteur du bois traversé, posée contre la carte, son bout affleure l'autre face du bois
  const chip = new BoxGeometry(6, 6, ch); chip.translate(-1.5, 0, chipZ); parts.push({ g: chip, c: new Color(PALETTE.lightGray) });
  const grille = new BoxGeometry(2, 2, 0.4); grille.translate(-1.5, 0, p.wood === undefined ? 2.5 : 0.8 + ch - 0.2 + 0.01); parts.push({ g: grille, c: new Color(PALETTE.slate) });
  for (let i = 0; i < 4; i++) { const pin = new BoxGeometry(0.64, 0.64, 4); pin.translate(-3.75 + i * 2.5, -p.h / 2 + 1.5, -1.8); parts.push({ g: pin, c: new Color(PALETTE.gold) }); }
  const geo = mergeColored(parts);
  return { geo, edges: edgesOf(geo) };
}
