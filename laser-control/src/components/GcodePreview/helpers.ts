import type { Segment } from '../../grbl';

/** Chemin SVG des segments coupés (`cut`, ou `engrave` pour la gravure) ou rapides, les segments qui se suivent étant joints en une seule polyligne. */
export function segmentsPath(segments: Segment[], cut: boolean, engrave: boolean): string {
  let d = '';
  let ex = Infinity, ey = Infinity;
  const f = (n: number) => +n.toFixed(2);
  for (const s of segments) {
    if (s.cut !== cut || (cut && !!s.engrave !== engrave)) continue;
    if (Math.abs(s.x0 - ex) > 1e-6 || Math.abs(s.y0 - ey) > 1e-6) d += `M${f(s.x0)} ${f(s.y0)}`;
    d += `L${f(s.x1)} ${f(s.y1)}`;
    ex = s.x1; ey = s.y1;
  }
  return d;
}

/** Fenêtre visible de l'aperçu, dans le repère du dessin (comme un `viewBox` SVG). */
export interface View { x: number; y: number; w: number; h: number }

/** Zoom maximal : la fenêtre ne descend pas en dessous de 1/`ZOOM_MAX` de la vue d'ensemble. */
export const ZOOM_MAX = 40;

/**
 * Zoom de `factor` (> 1 : on s'approche) autour du point (`px`, `py`) du dessin, qui reste sous le curseur. Jamais plus large que la vue d'ensemble `base`
 * (on revient alors à `base`), jamais plus étroit que `base.w / ZOOM_MAX`.
 */
export function zoomView(v: View, base: View, factor: number, px: number, py: number): View {
  const w = Math.min(base.w, Math.max(base.w / ZOOM_MAX, v.w / factor));
  if (w >= base.w) return { ...base };
  const k = w / v.w, h = v.h * k;
  return clampView({ x: px - (px - v.x) * k, y: py - (py - v.y) * k, w, h }, base);
}

/** Déplace la fenêtre de (`dx`, `dy`) unités du dessin, en la gardant dans la vue d'ensemble. */
export function panView(v: View, base: View, dx: number, dy: number): View {
  return clampView({ ...v, x: v.x + dx, y: v.y + dy }, base);
}

/** Garde la fenêtre `v` à l'intérieur de `base` (elle n'en est jamais plus grande). */
function clampView(v: View, base: View): View {
  return { ...v, x: Math.min(base.x + base.w - v.w, Math.max(base.x, v.x)), y: Math.min(base.y + base.h - v.h, Math.max(base.y, v.y)) };
}

/** Combien de segments en avant du dernier connu on cherche la tête : assez pour qu'une position rafraîchie lentement (la tête a parcouru beaucoup de petits segments) ne fasse pas décrocher le suivi. */
export const LOOKAHEAD = 400;

/** Parmi les segments à moins de cette distance (mm) du plus proche, on prend le premier : la tête est sur le tracé, un segment lointain qui s'en approche ne la lui prend pas. */
const TIE = 0.3;

/** Distance (mm) d'un point au segment [a, b]. */
function distanceToSegment(px: number, py: number, s: Segment): number {
  const dx = s.x1 - s.x0, dy = s.y1 - s.y0, len2 = dx * dx + dy * dy;
  const u = len2 > 0 ? Math.max(0, Math.min(1, ((px - s.x0) * dx + (py - s.y0) * dy) / len2)) : 0;
  return Math.hypot(px - (s.x0 + u * dx), py - (s.y0 + u * dy));
}

/**
 * Où en est le tracé : l'indice du segment que la tête est en train de parcourir. Les segments d'avant sont faits, ceux d'après restent à faire.
 * Le suivi part du dernier segment connu (`from`) et cherche la tête parmi les `LOOKAHEAD` suivants (le premier à moins de `TIE` du plus proche) : la machine a beaucoup de lignes d'avance dans sa mémoire tampon
 * (`acked` = lignes acceptées), donc on ne se fie pas aux lignes envoyées, seulement à la position réelle. Un segment n'est jamais compté s'il n'a pas été envoyé.
 * Sans position de la tête, on reste où l'on est. `segLines` = ligne qui trace chaque segment (`GcodeJob.segLines`).
 */
export function currentSegment(segments: Segment[], segLines: number[], acked: number, head: { x: number; y: number } | undefined, from = 0): number {
  let queued = 0;
  while (queued < segLines.length && segLines[queued] < acked) queued++;
  if (queued === 0 || !head) return from;
  const start = Math.min(from, queued - 1), end = Math.min(queued, from + LOOKAHEAD), dist: number[] = [];
  for (let k = start; k < end; k++) dist.push(distanceToSegment(head.x, head.y, segments[k]));
  const near = Math.min(...dist);
  return start + dist.findIndex((d) => d <= near + TIE);
}

/** Les coupes regroupées par pièce : `id[i]` = groupe du segment `i` (−1 : déplacement rapide ou gravure), `last[g]` = indice du dernier segment du groupe `g`. */
export interface Groups { id: number[]; last: number[] }

/**
 * Regroupe les segments de coupe en pièces : par le nom de pièce quand il est connu (trous puis contour extérieur ensemble), sinon par suite de traits de coupe sans déplacement rapide
 * (un contour, pour un G-code importé).
 */
export function segmentGroups(segments: Segment[]): Groups {
  const named = new Map<string, number>(), id: number[] = [], last: number[] = [];
  let run = -1, prevCut = false;
  segments.forEach((s, i) => {
    const isCut = s.cut && !s.engrave;
    let g = -1;
    if (isCut) {
      if (s.piece !== undefined) {
        let n = named.get(s.piece);
        if (n === undefined) { n = last.length; named.set(s.piece, n); last.push(i); }
        g = n;
      }
      else { if (!prevCut) { last.push(i); run = last.length - 1; } g = run; }
      last[g] = i;
    }
    id.push(g);
    prevCut = isCut;
  });
  return { id, last };
}

/** Les segments de coupe dont la pièce est finie : la tête (segment `current`) est passée après le dernier segment de leur groupe. */
export function finishedSegments(segments: Segment[], groups: Groups, current: number): { done: Segment[]; rest: Segment[] } {
  const done: Segment[] = [], rest: Segment[] = [];
  segments.forEach((s, i) => { (groups.id[i] >= 0 && groups.last[groups.id[i]] < current ? done : rest).push(s); });
  return { done, rest };
}
