import type { Pt } from '../types';

/**
 * Petite police à segments pour graver le code des plaques : chiffres 0–9, lettres A–Z et tiret sur une grille de 3 × 5 points (x 0..2, y 0..4, y vers le haut).
 * Chaque segment d'un tracé devient un petit rectangle FERMÉ (laser-control ne grave que des contours fermés), de largeur `STROKE`, prolongé d'une demi-largeur à chaque bout.
 * À l'échelle 1 : chiffre de 3,2 × 5,6 mm, trait de 0,8 mm, 4,4 mm d'un caractère au suivant. Le tiret (« T-01 ») sépare la catégorie du numéro.
 */

const UNIT = 1.2, STROKE = 0.8, ADVANCE = 4.4, GLYPH_W = 2 * UNIT + STROKE, GLYPH_H = 4 * UNIT + STROKE;
/** Hauteur d'un texte à l'échelle 1 (mm). */
export const TEXT_HEIGHT = GLYPH_H;

type Stroke = [number, number][];
const BOX: Stroke = [[0, 0], [2, 0], [2, 4], [0, 4], [0, 0]];
const P: Stroke = [[0, 0], [0, 4], [2, 4], [2, 2], [0, 2]];

/** Les tracés de chaque caractère (polylignes ouvertes ou fermées, en points de grille). */
export const FONT: Record<string, Stroke[]> = {
  '0': [BOX, [[0, 0], [2, 4]]],
  '1': [[[1, 0], [1, 4], [0, 3]]],
  '2': [[[0, 4], [2, 4], [2, 2], [0, 2], [0, 0], [2, 0]]],
  '3': [[[0, 4], [2, 4], [2, 0], [0, 0]], [[0, 2], [2, 2]]],
  '4': [[[0, 4], [0, 2], [2, 2]], [[2, 4], [2, 0]]],
  '5': [[[2, 4], [0, 4], [0, 2], [2, 2], [2, 0], [0, 0]]],
  '6': [[[2, 4], [0, 4], [0, 0], [2, 0], [2, 2], [0, 2]]],
  '7': [[[0, 4], [2, 4], [1, 0]]],
  '8': [BOX, [[0, 2], [2, 2]]],
  '9': [[[2, 0], [2, 4], [0, 4], [0, 2], [2, 2]]],
  '-': [[[0.2, 2], [1.8, 2]]],
  A: [[[0, 0], [0, 3], [1, 4], [2, 3], [2, 0]], [[0, 2], [2, 2]]],
  B: [[[0, 0], [0, 4], [1, 4], [2, 3], [1, 2], [0, 2]], [[1, 2], [2, 1], [1, 0], [0, 0]]],
  C: [[[2, 4], [0, 4], [0, 0], [2, 0]]],
  D: [[[0, 0], [0, 4], [1, 4], [2, 3], [2, 1], [1, 0], [0, 0]]],
  E: [[[2, 4], [0, 4], [0, 0], [2, 0]], [[0, 2], [1, 2]]],
  F: [[[2, 4], [0, 4], [0, 0]], [[0, 2], [1, 2]]],
  G: [[[2, 4], [0, 4], [0, 0], [2, 0], [2, 2], [1, 2]]],
  H: [[[0, 0], [0, 4]], [[2, 0], [2, 4]], [[0, 2], [2, 2]]],
  I: [[[0, 4], [2, 4]], [[1, 4], [1, 0]], [[0, 0], [2, 0]]],
  J: [[[0, 1], [1, 0], [2, 0], [2, 4]]],
  K: [[[0, 0], [0, 4]], [[2, 4], [0, 2], [2, 0]]],
  L: [[[0, 4], [0, 0], [2, 0]]],
  M: [[[0, 0], [0, 4], [1, 2], [2, 4], [2, 0]]],
  N: [[[0, 0], [0, 4], [2, 0], [2, 4]]],
  O: [BOX],
  P: [P],
  Q: [BOX, [[1, 1], [2, 0]]],
  R: [P, [[1, 2], [2, 0]]],
  S: [[[2, 3], [1, 4], [0, 3], [2, 1], [1, 0], [0, 1]]],
  T: [[[0, 4], [2, 4]], [[1, 4], [1, 0]]],
  U: [[[0, 4], [0, 0], [2, 0], [2, 4]]],
  V: [[[0, 4], [1, 0], [2, 4]]],
  W: [[[0, 4], [0, 0], [1, 2], [2, 0], [2, 4]]],
  X: [[[0, 4], [2, 0]], [[2, 4], [0, 0]]],
  Y: [[[0, 4], [1, 2], [2, 4]], [[1, 2], [1, 0]]],
  Z: [[[0, 4], [2, 4], [0, 0], [2, 0]]],
};

/** Rectangle fermé (4 points) d'un segment, d'épaisseur `w`, prolongé d'une demi-épaisseur à chaque bout. */
function segmentRect(a: Pt, b: Pt, w: number): Pt[] {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len, h = w / 2;
  const ax = a[0] - ux * h, ay = a[1] - uy * h, bx = b[0] + ux * h, by = b[1] + uy * h;
  return [[ax - uy * h, ay + ux * h], [bx - uy * h, by + ux * h], [bx + uy * h, by - ux * h], [ax + uy * h, ay - ux * h]];
}

export interface TextShape {
  /** Contours fermés des traits, origine en bas à gauche du texte (y vers le haut), en mm. */
  contours: Pt[][];
  /** Largeur et hauteur du texte (mm), traits compris. */
  w: number;
  h: number;
}

/** Largeur d'un texte de `n` caractères à l'échelle `scale` (mm). */
export const textWidth = (n: number, scale = 1): number => (n * ADVANCE - (ADVANCE - GLYPH_W)) * scale;

/**
 * Le texte en contours fermés (un rectangle par segment). Les caractères inconnus sont sautés (laissés en blanc) ; les minuscules passent en majuscules.
 */
export function textContours(text: string, scale = 1): TextShape {
  const contours: Pt[][] = [];
  const s = scale, half = STROKE / 2;
  const w = textWidth([...text].length, 1);
  const clamp = ([x, y]: Pt): Pt => [Math.min(Math.max(x, 0), w) * s, Math.min(Math.max(y, 0), GLYPH_H) * s]; // les bouts d'un trait en diagonale dépassent le cadre de quelques dixièmes : on les rogne
  [...text.toUpperCase()].forEach((ch, i) => {
    const x0 = i * ADVANCE + half, y0 = half;
    for (const stroke of FONT[ch] ?? []) {
      for (let k = 0; k + 1 < stroke.length; k++) {
        const a: Pt = [x0 + stroke[k][0] * UNIT, y0 + stroke[k][1] * UNIT], b: Pt = [x0 + stroke[k + 1][0] * UNIT, y0 + stroke[k + 1][1] * UNIT];
        contours.push(segmentRect(a, b, STROKE).map(clamp));
      }
    }
  });
  return { contours, w: w * s, h: GLYPH_H * s };
}
