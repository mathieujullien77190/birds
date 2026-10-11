import { BoxGeometry, Color } from 'three';
import { PALETTE } from '../../registry/palette';
import { mergeColored, emptyEdges, type Part, type PartGeometry } from '../geometry';
import type { Plank } from '../../../model';

/** Panneau solaire : cadre alu, verre bleu nuit, 10 × 6 cellules séparées par de fins joints, 3 barres collectrices par cellule, 2 rails et une boîte de jonction au dos. */
export function solarGeometry(p: Plank): PartGeometry {
  const parts: Part[] = [], W = p.w, H = p.h, D = p.depth ?? 35, F = 30, top = D / 2;
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: string) => { const g = new BoxGeometry(w, h, d); g.translate(x, y, z); parts.push({ g, c: new Color(c) }); };
  box(W, F, D, 0, H / 2 - F / 2, 0, PALETTE.aluminiumFrame); box(W, F, D, 0, -H / 2 + F / 2, 0, PALETTE.aluminiumFrame); // cadre : deux grands côtés
  box(F, H - 2 * F, D, -W / 2 + F / 2, 0, 0, PALETTE.aluminiumFrame); box(F, H - 2 * F, D, W / 2 - F / 2, 0, 0, PALETTE.aluminiumFrame); // deux petits côtés
  const iw = W - 2 * F, ih = H - 2 * F;
  box(iw, ih, 6, 0, 0, top - 3 - 4, PALETTE.solarGlass); // verre + fond bleu nuit
  const cols = 10, rows = 6, gap = 3, cw = (iw - 2 * 6 - (cols - 1) * gap) / cols, ch = (ih - 2 * 6 - (rows - 1) * gap) / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const cx = -iw / 2 + 6 + cw / 2 + i * (cw + gap), cy = -ih / 2 + 6 + ch / 2 + j * (ch + gap), cz = top - 3.6; // posées sur le verre
    box(cw, ch, 0.8, cx, cy, cz, PALETTE.solarCell); // cellule
    for (const f of [-1, 0, 1]) box(0.8, ch, 0.3, cx + f * cw / 3.2, cy, cz + 0.55, PALETTE.solarBusbar); // barres collectrices
  }
  box(W - 80, 30, 18, 0, -ih / 4, -top - 9, PALETTE.steel); box(W - 80, 30, 18, 0, ih / 4, -top - 9, PALETTE.steel); // deux rails alu au dos
  box(120, 70, 26, 0, H / 2 - F - 50, -top - 13, PALETTE.nearBlack); // boîte de jonction
  const geo = mergeColored(parts);
  return { geo, edges: emptyEdges() };
}
