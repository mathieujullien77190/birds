import { BoxGeometry, Color, ExtrudeGeometry, Path, Shape } from 'three';
import type { Plank } from '../../../model';
import { PALETTE } from '../../registry/palette';
import { piModel } from '../../piModel';
import { coloredPart, emptyEdges, type Part, type PartGeometry } from '../geometry';

/** Raspberry Pi 5 d'après le plan mécanique officiel (85 × 56, coins de 3, 4 trous Ø 2,7 à 3,5 mm des bords, entraxe 58 × 49) ; composants à leur place, formes simplifiées (cotes lues sur le dessin à l'échelle 1:1, approximatives). Dessin de repli tant que le modèle 3D (STEP du Pi 5) n'est pas chargé. */
export function simplePiGeometry(p: Plank): PartGeometry {
  const parts: Part[] = [];
  const px = (x: number) => x - p.w / 2, py = (y: number) => y - p.h / 2; // repère du plan (coin bas gauche) → repère centré
  const W = p.w, H = p.h, R = 3;
  const shape = new Shape();
  shape.moveTo(-W / 2 + R, -H / 2); shape.lineTo(W / 2 - R, -H / 2); shape.absarc(W / 2 - R, -H / 2 + R, R, -Math.PI / 2, 0, false);
  shape.lineTo(W / 2, H / 2 - R); shape.absarc(W / 2 - R, H / 2 - R, R, 0, Math.PI / 2, false);
  shape.lineTo(-W / 2 + R, H / 2); shape.absarc(-W / 2 + R, H / 2 - R, R, Math.PI / 2, Math.PI, false);
  shape.lineTo(-W / 2, -H / 2 + R); shape.absarc(-W / 2 + R, -H / 2 + R, R, Math.PI, 1.5 * Math.PI, false);
  for (const [hx, hy] of [[3.5, 3.5], [61.5, 3.5], [3.5, 52.5], [61.5, 52.5]]) { const h = new Path(); h.absarc(px(hx), py(hy), 1.35, 0, Math.PI * 2, true); shape.holes.push(h); }
  const board = new ExtrudeGeometry(shape, { depth: 1.4, bevelEnabled: false, curveSegments: 12 }); board.translate(0, 0, -0.7);
  parts.push({ g: board, c: new Color(PALETTE.piGreen) });
  const SILVER = new Color(PALETTE.silver), BLACK = new Color(PALETTE.nearBlack), GOLD = new Color(PALETTE.gold), WHITE = new Color(PALETTE.offWhite);
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: Color) => { const g = new BoxGeometry(w, h, d); g.translate(px(x), py(y), z); parts.push({ g, c }); };
  box(17, 17, 2.5, 33.3, 22.6, 1.95, SILVER); // BCM2712 sous son capot métallique
  box(14.7, 10, 1.2, 33.2, 39, 1.3, BLACK); // mémoire
  box(12, 12, 1.2, 58.4, 35, 1.3, BLACK); // RP1
  box(9, 7.3, 3.2, 11.2, 3.65, 2.3, SILVER); // USB-C d'alimentation, au bord bas
  box(6.5, 7.5, 3, 25.8, 3.75, 2.2, SILVER); // micro-HDMI 0
  box(6.5, 7.5, 3, 39.2, 3.75, 2.2, SILVER); // micro-HDMI 1
  box(3.3, 15, 2.4, 48.7, 8.5, 1.9, WHITE); // connecteur de nappe CAM/DISP (22 broches)
  box(3.3, 15, 2.4, 55, 8.5, 1.9, WHITE); // second connecteur de nappe CAM/DISP (22 broches)
  box(21, 16.2, 13.5, 77.5, 10.1, 7.45, SILVER); // Ethernet, dépasse de 3 mm du bord droit
  box(17, 14, 15.6, 79.5, 29.1, 8.5, SILVER); // pile de 2 USB (bas)
  box(17, 14, 15.6, 79.5, 47, 8.5, SILVER); // pile de 2 USB (haut)
  box(51, 5, 2.5, 32.5, 52.5, 1.95, BLACK); // support des broches GPIO 2 × 20
  for (let i = 0; i < 20; i++) for (const dy of [-1.27, 1.27]) box(0.64, 0.64, 3, 32.5 + (i - 9.5) * 2.54, 52.5 + dy, 3.2, GOLD);
  return coloredPart(parts);
}

/** Raspberry Pi : le modèle 3D (STEP du Pi 5 converti) une fois chargé, sinon le dessin simplifié du Pi 5. */
export function piGeometry(p: Plank): PartGeometry {
  return piModel ? { geo: piModel.clone(), edges: emptyEdges() } : simplePiGeometry(p);
}
