import type { Pt, Plank } from '../types';
import { holeOutline } from '../geometry/holes';
import { outline } from '../geometry/outline';
import { plankSignature } from './partCodes';
import { textContours, textWidth, TEXT_HEIGHT } from './codeText';

/** Marge (mm) entre le texte gravé et tout bord : contour, dent, trou. */
export const CODE_MARGIN = 1.2;
/** Échelles essayées (hauteur du texte : 5, 4 puis 3 mm), avec la marge `CODE_MARGIN`. */
export const CODE_SCALES = [1, 0.8, 0.6];
/** Plaques où rien de cela ne tient : version « tout mini » (hauteur 2,8 à 1,7 mm), marge réduite, puis, au plus petit, sans marge là où il tient dans la matière. */
export const CODE_SCALES_MIN = [0.5, 0.4, 0.3];
export const CODE_MARGIN_MIN = 0.4;
const STEP = 2, STEP_MIN = 0.5; // pas de la grille des emplacements essayés (mm) : plus fin pour la version tout mini, qui doit se glisser dans des bandes de 3 mm

/** Emplacement du code sur une plaque (repère de la plaque, centrée) : centre du texte, échelle, et `turned` = texte couché (lu de bas en haut, tourné de 90°). */
export interface CodeSpot { x: number; y: number; scale: number; turned: boolean; /** Encombrement du texte dans le repère de la plaque. */ w: number; h: number }

const inside = (pts: Pt[], x: number, y: number): boolean => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

/** Le segment [a, b] touche-t-il le rectangle (méthode des tranches) ? */
function hits(a: Pt, b: Pt, x0: number, y0: number, x1: number, y1: number): boolean {
  let t0 = 0, t1 = 1;
  for (const [d, lo, hi, o] of [[b[0] - a[0], x0, x1, a[0]], [b[1] - a[1], y0, y1, a[1]]] as const) {
    if (d === 0) { if (o < lo || o > hi) return false; continue; }
    let u = (lo - o) / d, v = (hi - o) / d;
    if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u); t1 = Math.min(t1, v);
    if (t0 > t1) return false;
  }
  return true;
}

const cache = new Map<string, CodeSpot | null>();

/**
 * Où graver un code de `len` caractères sur la plaque : le premier endroit libre, en partant du centre, où le texte (et `CODE_MARGIN` tout autour) tient dans la matière :
 * ni sur un bord, ni sur une dent ou un cran, ni sur un trou. On essaie la hauteur 5 mm, horizontal puis couché, puis 4 mm, puis 3 mm ; sinon la version tout mini (`CODE_SCALES_MIN`, marge réduite) ; sinon au plus petit sans marge, là où le texte tient dans la matière. `null` seulement si le texte ne tient nulle part.
 * Même résultat pour des plaques identiques (mémorisé).
 */
export function codeSpot(p: Plank, len: number): CodeSpot | null {
  const key = `${plankSignature(p, 0)}|${len}`;
  if (cache.has(key)) return cache.get(key)!;
  if (cache.size > 2000) cache.clear();
  const spot = search(p, len);
  cache.set(key, spot);
  return spot;
}

function search(p: Plank, len: number): CodeSpot | null {
  const outer = outline(p), holes = p.holes.map(holeOutline);
  const edges: [Pt, Pt][] = [];
  for (const loop of [outer, ...holes]) for (let i = 0; i < loop.length; i++) edges.push([loop[i], loop[(i + 1) % loop.length]]);
  const free = (cx: number, cy: number, w: number, h: number, m: number): boolean => {
    const x0 = cx - w / 2 - m, x1 = cx + w / 2 + m, y0 = cy - h / 2 - m, y1 = cy + h / 2 + m;
    if (!inside(outer, cx, cy) || holes.some((hl) => inside(hl, cx, cy))) return false;
    return !edges.some(([a, b]) => hits(a, b, x0, y0, x1, y1));
  };
  const tries: [number, number][] = [...CODE_SCALES.map((s): [number, number] => [s, CODE_MARGIN]), ...CODE_SCALES_MIN.map((s): [number, number] => [s, CODE_MARGIN_MIN])];
  for (const [scale, margin] of tries) {
    for (const turned of [false, true]) {
      const tw = textWidth(len, scale), th = TEXT_HEIGHT * scale;
      const w = turned ? th : tw, h = turned ? tw : th;
      const cands: Pt[] = [];
      const step = scale < 0.6 ? STEP_MIN : STEP;
      const kx = Math.floor((p.w - w) / 2 / step), ky = Math.floor((p.h - h) / 2 / step); // grille symétrique autour du centre (le centre en fait partie)
      for (let i = -kx; i <= kx; i++) for (let j = -ky; j <= ky; j++) cands.push([i * step, j * step]);
      cands.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
      const c = cands.find(([x, y]) => free(x, y, w, h, margin));
      if (c) return { x: c[0], y: c[1], scale, turned, w, h };
    }
  }
  // rien de libre avec une marge : tout mini, sans marge, là où le texte tient dans la matière
  const scale = CODE_SCALES_MIN[CODE_SCALES_MIN.length - 1], tw = textWidth(len, scale), th = TEXT_HEIGHT * scale;
  for (const turned of [false, true]) {
    const w = turned ? th : tw, h = turned ? tw : th, cands: Pt[] = [];
    const kx = Math.floor((p.w - w) / 2 / STEP_MIN), ky = Math.floor((p.h - h) / 2 / STEP_MIN);
    for (let i = -kx; i <= kx; i++) for (let j = -ky; j <= ky; j++) cands.push([i * STEP_MIN, j * STEP_MIN]);
    cands.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
    const c = cands.find(([x, y]) => free(x, y, w, h, 0));
    if (c) return { x: c[0], y: c[1], scale, turned, w, h };
  }
  return null;
}

/** Les contours fermés du code dans le repère de la plaque (centrée, y vers le haut), à l'emplacement `spot`. */
export function codeOutlines(spot: CodeSpot, text: string): Pt[][] {
  const { contours, w, h } = textContours(text, spot.scale);
  return contours.map((c) => c.map(([u, v]): Pt => (spot.turned ? [spot.x - (v - h / 2), spot.y + (u - w / 2)] : [spot.x + (u - w / 2), spot.y + (v - h / 2)])));
}
