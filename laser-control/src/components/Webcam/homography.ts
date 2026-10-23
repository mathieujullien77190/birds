export type Pt = readonly [number, number];
/** Matrice 3×3 rangée par lignes : [a, b, c, d, e, f, g, h, 1]. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

/** Homographie qui envoie le carré unité (0,0) (1,0) (1,1) (0,1) sur le quadrilatère `q` (dans le même ordre) : la vue plate vers l'image de la caméra. */
export function squareToQuad(q: readonly [Pt, Pt, Pt, Pt]): Mat3 {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  if (Math.abs(dx3) < 1e-12 && Math.abs(dy3) < 1e-12) return [x1 - x0, x2 - x1, x0, y1 - y0, y2 - y1, y0, 0, 0, 1];
  const den = dx1 * dy2 - dy1 * dx2;
  const g = (dx3 * dy2 - dy3 * dx2) / den, h = (dx1 * dy3 - dy1 * dx3) / den;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}

/** Applique l'homographie à un point (u, v). */
export function applyH(m: Mat3, u: number, v: number): Pt {
  const w = m[6] * u + m[7] * v + m[8];
  return [(m[0] * u + m[1] * v + m[2]) / w, (m[3] * u + m[4] * v + m[5]) / w];
}

/** Correction de l'objectif (distorsion radiale) : point corrigé → point de l'image brute, centre (0,5 ; 0,5), `aspect` = largeur / hauteur de l'image. `k1` < 0 corrige un effet de tonneau (lignes qui bombent). */
export function distort(p: Pt, k1: number, aspect: number): Pt {
  const cx = (p[0] - 0.5) * aspect, cy = p[1] - 0.5;
  const f = 1 + k1 * (cx * cx + cy * cy);
  return [(cx * f) / aspect + 0.5, cy * f + 0.5];
}
