import type { Polyline } from './types';

/** Aire d'un polygone (formule des lacets, valeur absolue). */
export function area(pts: Polyline): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return Math.abs(a) / 2;
}

/** Contour en segments droits : points doubles et alignés retirés, point de fermeture répété retiré. */
export function simplifyContour(pts: Polyline, tol = 0.005): Polyline {
  let p = pts.filter((q, i) => i === 0 || Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) > 1e-6);
  if (p.length > 1 && Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) < 1e-6) p = p.slice(0, -1);
  let changed = true;
  while (changed && p.length > 3) {
    changed = false;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length];
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
      if (Math.abs(cross) / len < tol && (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) >= 0) { p = p.filter((_, k) => k !== i); changed = true; break; }
    }
  }
  return p;
}

/** Le point est-il à l'intérieur du polygone (lancer de rayon) ? */
export function inside(pt: [number, number], poly: Polyline): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export interface Box { minX: number; minY: number; maxX: number; maxY: number }

/** Rectangle englobant des polylignes (`null` s'il n'y a aucun point). */
export function boundsOf(lines: Polyline[]): Box | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const l of lines) for (const [x, y] of l) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}
