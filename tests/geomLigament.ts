import { holeOutline, outline, type Hole, type Plank, type Pt } from '@/birdhouse/model';

/** Ligaments de bois : distance minimale entre le contour d'un trou « cible » et tout autre bord de la même plaque (contour avec ses crans, autres trous). */
const segDist = (p: Pt, a: Pt, b: Pt): number => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, u = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - (a[0] + u * dx), p[1] - (a[1] + u * dy));
};
const edges = (poly: Pt[]): [Pt, Pt][] => poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);
const sample = (poly: Pt[], step = 0.5): Pt[] => edges(poly).flatMap(([a, b]) => { const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)); return Array.from({ length: n }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n] as Pt); });

/** Ligament minimal (mm) autour du trou `target` d'une plaque, avec la région la plus proche. */
export function ligament(p: Plank, target: Hole): { min: number; at: Pt } {
  const others: [Pt, Pt][] = [...edges(outline(p)), ...p.holes.filter((h) => h !== target).flatMap((h) => edges(holeOutline(h)))];
  let min = 1e9, at: Pt = [0, 0];
  for (const s of sample(holeOutline(target))) for (const [a, b] of others) { const d = segDist(s, a, b); if (d < min) { min = d; at = s; } }
  return { min, at };
}
