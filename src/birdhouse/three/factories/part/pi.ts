import { BoxGeometry, Color, ExtrudeGeometry, Path, Shape } from 'three';
import type { Plank } from '../../../model';
import { PALETTE } from '../../registry/palette';
import { piModel } from '../../piModel';
import { coloredPart, emptyEdges, type Part, type PartGeometry } from '../geometry';

/** Raspberry Pi Zero 2 W d'après le plan mécanique officiel (65 × 30, coins de 3, trous Ø 2,75 à 3,5 des bords) ; composants à leur place, formes simplifiées. Dessin de repli tant que le modèle 3D du Pi 4 n'est pas chargé. */
export function simplePiGeometry(p: Plank): PartGeometry {
  const parts: Part[] = [];
  const px = (x: number) => x - p.w / 2, py = (y: number) => y - p.h / 2; // repère du plan (coin bas gauche) → repère centré
  const W = p.w, H = p.h, R = 3;
  const shape = new Shape();
  shape.moveTo(-W / 2 + R, -H / 2); shape.lineTo(W / 2 - R, -H / 2); shape.absarc(W / 2 - R, -H / 2 + R, R, -Math.PI / 2, 0, false);
  shape.lineTo(W / 2, H / 2 - R); shape.absarc(W / 2 - R, H / 2 - R, R, 0, Math.PI / 2, false);
  shape.lineTo(-W / 2 + R, H / 2); shape.absarc(-W / 2 + R, H / 2 - R, R, Math.PI / 2, Math.PI, false);
  shape.lineTo(-W / 2, -H / 2 + R); shape.absarc(-W / 2 + R, -H / 2 + R, R, Math.PI, 1.5 * Math.PI, false);
  for (const [hx, hy] of [[3.5, 3.5], [61.5, 3.5], [3.5, 26.5], [61.5, 26.5]]) { const h = new Path(); h.absarc(px(hx), py(hy), 1.375, 0, Math.PI * 2, true); shape.holes.push(h); }
  const board = new ExtrudeGeometry(shape, { depth: 1.4, bevelEnabled: false, curveSegments: 12 }); board.translate(0, 0, -0.7);
  parts.push({ g: board, c: new Color(PALETTE.piGreen) });
  const SILVER = new Color(PALETTE.silver), BLACK = new Color(PALETTE.nearBlack), GOLD = new Color(PALETTE.gold), WHITE = new Color(PALETTE.offWhite);
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: Color) => { const g = new BoxGeometry(w, h, d); g.translate(px(x), py(y), z); parts.push({ g, c }); };
  box(12.5, 12.5, 1.1, 33, 14, 1.25, SILVER); // RP3A0 sous son blindage
  box(11.2, 7.5, 3.3, 12.4, 3.5, 2.35, SILVER); // mini HDMI, au bord bas
  box(8, 5.6, 2.6, 41.4, 2.8, 2.0, SILVER); // micro USB données
  box(8, 5.6, 2.6, 54, 2.8, 2.0, SILVER); // micro USB alimentation
  box(14, 11.5, 1.8, 6.5, 16.9, 1.1, SILVER); // lecteur microSD, au bout gauche
  box(4, 17, 2, 61.5, 15, 1.7, WHITE); // connecteur de nappe caméra, au bout droit
  box(51, 5, 2.5, 32.5, 26.5, 1.95, BLACK); // support des broches GPIO 2 × 20
  for (let i = 0; i < 20; i++) for (const dy of [-1.27, 1.27]) box(0.64, 0.64, 3, 32.5 + (i - 9.5) * 2.54, 26.5 + dy, 3.2, GOLD);
  return coloredPart(parts);
}

/** Raspberry Pi : le modèle 3D du Pi 4 (STEP converti) une fois chargé, sinon le dessin simplifié. */
export function piGeometry(p: Plank): PartGeometry {
  return piModel ? { geo: piModel.clone(), edges: emptyEdges() } : simplePiGeometry(p);
}
