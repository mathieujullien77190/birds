import { type Pt, type Hole, type Plank } from '../types';
import { r2 } from '../util';

/** Demi-dimensions d'un trou. */
export const holeHalf = (h: Hole): [number, number] => (h.shape === 'square' ? [h.size / 2, (h.sh ?? h.size) / 2] : [h.size / 2, h.size / 2]);

/**
 * Ramène un trou entièrement dans la plaque (1 mm de bord au moins) : un trou qui sort du contour casse la triangulation
 * de la face (la plaque s'affiche en lambeaux). Réduit le trou s'il est trop grand, puis le recentre.
 */
export function fitHole(p: Plank, h: Hole): Hole {
  const M = 1;
  const maxW = Math.max(1, p.w - 2 * M), maxH = Math.max(1, p.h - 2 * M);
  let size = h.size, sh = h.sh ?? h.size;
  if (h.shape === 'square') { size = Math.min(size, maxW); sh = Math.min(sh, maxH); } else size = Math.min(size, maxW, maxH);
  const next: Hole = { ...h, size: +size.toFixed(2), sh: h.shape === 'square' ? +sh.toFixed(2) : undefined, r: h.shape === 'square' ? Math.min(h.r ?? 0, size / 2, sh / 2) : undefined };
  const [hw, hh] = holeHalf(next);
  next.x = r2(Math.min(Math.max(h.x, -p.w / 2 + M + hw), p.w / 2 - M - hw)); // au centième : les fentes des dents doivent tomber juste
  next.y = r2(Math.min(Math.max(h.y, -p.h / 2 + M + hh), p.h / 2 - M - hh));
  return next;
}

/** Contour d'un trou (sens trigonométrique), pour la découpe et la 3D. */
export function holeOutline(h: Hole): Pt[] {
  if (h.poly) return h.poly;
  const r = h.size / 2;
  if (h.shape === 'square') {
    const [hw, hh] = holeHalf(h);
    const rr = Math.min(h.r ?? 0, hw, hh);
    if (rr <= 0.05) return [[h.x - hw, h.y - hh], [h.x + hw, h.y - hh], [h.x + hw, h.y + hh], [h.x - hw, h.y + hh]];
    // coins arrondis : un quart de cercle de 8 segments à chaque coin, dans le sens trigonométrique
    const out: Pt[] = [];
    const corners: [number, number, number][] = [[h.x + hw - rr, h.y - hh + rr, -Math.PI / 2], [h.x + hw - rr, h.y + hh - rr, 0], [h.x - hw + rr, h.y + hh - rr, Math.PI / 2], [h.x - hw + rr, h.y - hh + rr, Math.PI]];
    for (const [cx, cy, a0] of corners) for (let i = 0; i <= 8; i++) { const a = a0 + (i / 8) * (Math.PI / 2); out.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); }
    return out;
  }
  const n = 32;
  return Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [h.x + r * Math.cos(a), h.y + r * Math.sin(a)] as Pt; });
}

/** Contour de l'union de rectangles [x0, y0, x1, y1] alignés sur les axes (supposée d'un seul tenant, sans trou), sens trigonométrique : on remplit une grille compressée et on enchaîne les arêtes qui ne s'annulent pas. */
export function rectUnion(rs: [number, number, number, number][]): Pt[] {
  const q = (v: number) => +v.toFixed(3);
  const xs = [...new Set(rs.flatMap((r) => [q(r[0]), q(r[2])]))].sort((a, b) => a - b), ys = [...new Set(rs.flatMap((r) => [q(r[1]), q(r[3])]))].sort((a, b) => a - b);
  const filled = (i: number, j: number) => rs.some((r) => xs[i] >= r[0] - 1e-3 && xs[i + 1] <= r[2] + 1e-3 && ys[j] >= r[1] - 1e-3 && ys[j + 1] <= r[3] + 1e-3);
  const E = new Map<string, [Pt, Pt]>(), key = (a: Pt, b: Pt) => `${a[0]},${a[1]}|${b[0]},${b[1]}`;
  const add = (a: Pt, b: Pt) => { const rev = key(b, a); if (E.has(rev)) E.delete(rev); else E.set(key(a, b), [a, b]); };
  for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < ys.length; j++) {
    if (!filled(i, j)) continue;
    const a: Pt = [xs[i], ys[j]], b: Pt = [xs[i + 1], ys[j]], c: Pt = [xs[i + 1], ys[j + 1]], d: Pt = [xs[i], ys[j + 1]];
    add(a, b); add(b, c); add(c, d); add(d, a);
  }
  const next = new Map<string, Pt>(); for (const [a, b] of E.values()) next.set(`${a[0]},${a[1]}`, b);
  const first = [...E.values()][0]; if (!first) return [];
  const loop: Pt[] = [first[0]]; let cur = first[1];
  while (cur[0] !== first[0][0] || cur[1] !== first[0][1]) { loop.push(cur); const n = next.get(`${cur[0]},${cur[1]}`); if (!n) break; cur = n; }
  return loop.filter((p, i) => { const a = loop[(i + loop.length - 1) % loop.length], b = loop[(i + 1) % loop.length]; return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0; }); // sans les points alignés
}
