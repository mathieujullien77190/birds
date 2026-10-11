import { area, boundsOf, inside, simplifyContour, type Box } from './geometry';
import type { LaserJob, LaserPiece, Polyline } from './types';

/** Un contour à couper, en coordonnées machine (mm, origine bas-gauche). */
export interface Contour { pts: Polyline; hole: boolean; area: number; piece: string }

/** Regroupe `layers.cut` en pièces : un contour à profondeur paire est une pièce, ceux qui sont directement dedans (profondeur impaire) sont ses trous. */
export function groupPieces(cut: Polyline[]): LaserPiece[] {
  const c = cut.map((p) => simplifyContour(p)).filter((p) => p.length >= 3);
  const ar = c.map(area);
  const parent = c.map((p, i) => {
    let best = -1;
    c.forEach((q, j) => { if (j !== i && ar[j] > ar[i] && inside(p[0], q) && (best < 0 || ar[j] < ar[best])) best = j; });
    return best;
  });
  const depth = (i: number): number => (parent[i] < 0 ? 0 : 1 + depth(parent[i]));
  const pieces: LaserPiece[] = [];
  c.forEach((p, i) => {
    if (depth(i) % 2) return;
    pieces.push({ name: `Pièce ${pieces.length + 1}`, contours: [p, ...c.filter((_, j) => parent[j] === i)] });
  });
  return pieces;
}

/**
 * Contours dans l'ordre de coupe : pièces des plus petites aux plus grandes (une petite pièce rangée dans le creux d'une grande
 * est coupée avant que le creux ne soit libéré), et pour chaque pièce ses trous AVANT son contour extérieur (la pièce tient jusqu'au bout).
 */
export function orderContours(job: LaserJob): Contour[] {
  const pieces = (job.pieces?.length ? job.pieces : groupPieces(job.layers.cut)).map((pc) => {
    const all = pc.contours.map((p) => simplifyContour(p));
    let oi = 0;
    all.forEach((p, i) => { if (area(p) > area(all[oi])) oi = i; });
    const outer = all[oi] ?? [];
    const holes = all.filter((_, i) => i !== oi).filter((h) => h.length >= 3).sort((a, b) => area(a) - area(b));
    return { name: pc.name, outer, holes, area: area(outer) };
  }).sort((a, b) => a.area - b.area);
  const out: Contour[] = [];
  for (const p of pieces) {
    for (const h of p.holes) out.push({ pts: h, hole: true, area: area(h), piece: p.name });
    if (p.outer.length >= 3) out.push({ pts: p.outer, hole: false, area: p.area, piece: p.name });
  }
  return out;
}

/** Rectangle englobant les contours de coupe (pour le cadre « autour des pièces »). */
export function jobBox(job: LaserJob): Box | null {
  if (job.frame) return job.frame;
  return boundsOf(job.pieces?.length ? job.pieces.flatMap((p) => p.contours) : job.layers.cut);
}
