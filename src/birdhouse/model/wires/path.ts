import type { Vec3 } from '../types';

/**
 * Arrondit les angles d'un chemin : à chaque sommet intermédiaire, le coude est remplacé par un arc (Bézier quadratique, 6 pas) de rayon r — un vrai fil ne fait pas d'angle vif,
 * il tourne en courbe. r est limité à la moitié des deux segments voisins pour que les arcs ne se chevauchent pas. Fonction pure (partagée par le dessin 3D et la longueur du fil).
 */
export function roundPoints(pts: Vec3[], r: number): Vec3[] {
  if (pts.length < 3) return pts;
  const out: Vec3[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const A = pts[i - 1], P = pts[i], B = pts[i + 1];
    const da = [A[0] - P[0], A[1] - P[1], A[2] - P[2]], db = [B[0] - P[0], B[1] - P[1], B[2] - P[2]];
    const la = Math.hypot(da[0], da[1], da[2]), lb = Math.hypot(db[0], db[1], db[2]);
    if (la < 1e-6 || lb < 1e-6) continue;
    const rr = Math.min(r, la / 2, lb / 2);
    const p0 = [0, 1, 2].map((k) => P[k] + da[k] * (rr / la)), p2 = [0, 1, 2].map((k) => P[k] + db[k] * (rr / lb));
    for (let k = 0; k <= 6; k++) {
      const u = k / 6, a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
      out.push([0, 1, 2].map((j) => p0[j] * a + P[j] * b + p2[j] * c) as Vec3);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Longueur (mm) d'une polyligne. */
export function polylineLength(pts: Vec3[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
  return len;
}
