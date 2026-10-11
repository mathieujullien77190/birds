import { type Edge, type Notch, type Plank } from '../types';
import { uid } from '../util';
import { TOOTH } from '../constants';

/** Longueur du bord qui porte un cran. */
export const edgeLength = (p: Plank, edge: Edge): number => (edge === 'top' || edge === 'bottom' ? p.w : p.h);

/**
 * Crénelage d'emboîtement sur un bord : le bord est partagé en `segments` dents égales ; une dent sur deux est creusée
 * (profondeur = épaisseur `t`, pour que l'autre plaque affleure ; largeur = dent + jeu). `phase` 0 : la première dent est
 * creuse, 1 : pleine. La plaque d'en face prend le même crénelage avec l'autre phase.
 */
export function castellation(p: Plank, edge: Edge, segments: number, phase: 0 | 1, t: number, fit: number): Notch[] {
  const L = edgeLength(p, edge), seg = L / segments;
  const out: Notch[] = [];
  for (let i = 0; i < segments; i++) if (i % 2 === phase) out.push({ id: uid(), edge, pos: +((i + 0.5) * seg).toFixed(2), width: +(seg + fit).toFixed(2), depth: t });
  return out;
}

/** Nombre impair de dents pour un bord de longueur `len` (une dent ≈ TOOTH mm, 3 au moins) : la dent réelle = len / n, au plus près de 16 mm. */
export const teethFor = (len: number): number => { const n = Math.max(3, Math.round(len / TOOTH)); return n % 2 ? n : n + 1; };

/** Refait les crénelages d'une plaque (après un changement d'épaisseur, par exemple) : la profondeur des crans suit `t`. */
export function recastAll(p: Plank, t: number, fit: number): Plank {
  if (!p.cast) return p;
  const edges = Object.keys(p.cast) as Edge[];
  return { ...p, notches: [...p.notches.filter((n) => !edges.includes(n.edge)), ...edges.flatMap((e) => castellation(p, e, p.cast![e]!.n, p.cast![e]!.phase, t, fit))] };
}
