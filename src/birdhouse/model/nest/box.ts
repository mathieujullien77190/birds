import { type Vec3, type Edge, type Plank } from '../types';
import { uid } from '../util';
import { castellation, teethFor } from '../geometry/castellation';
import { rotFromBasis } from '../geometry/transform';

/**
 * Une boîte fermée de l × L × H (dimensions extérieures) en 6 plaques crénelées qui s'emboîtent, posées en place (le dessous sur y = 0).
 * Phases : faces avant / arrière creuses aux bouts sur leurs 4 bords (0) ; côtés pleins aux bouts sur leurs bords verticaux (1), creux en haut / bas (0) ;
 * dessus / dessous pleins aux bouts partout (1). Chaque arête réunit ainsi un bord 0 et un bord 1 ; le nombre de dents dépend de la longueur de l'arête,
 * impair, donc symétrique : l'orientation de chaque plaque n'a pas d'importance.
 */
export function makeBox(l: number, L: number, H: number, t: number, fit: number, start = 1): { planks: Plank[]; group: string; name: string } {
  void fit; // une boîte est toujours créée sans jeu : la largeur d'un cran = celle d'une dent moins le serrage `CRENEL_SNUG` (les plaques tiennent seules)
  fit = 0;
  const nl = teethFor(l), nL = teethFor(L), nH = teethFor(H);
  const mk = (name: string, w: number, h: number, pos: Vec3, rot: Vec3, edges: Partial<Record<Edge, { n: number; phase: 0 | 1 }>>): Plank => {
    const p: Plank = { id: uid(), name, w, h, pos, rot, notches: [], holes: [], cast: edges, group };
    p.notches = (Object.keys(edges) as Edge[]).flatMap((e) => castellation(p, e, edges[e]!.n, edges[e]!.phase, t, fit));
    return p;
  };
  const z = H / 2, k = start, group = uid(); // les six plaques sont liées : la boîte bouge d'un bloc
  const wall = rotFromBasis([1, 0, 0], [0, 0, 1]); // plaque debout face à l'avant : x → x, hauteur → z
  const side = rotFromBasis([0, 1, 0], [0, 0, 1]); // plaque debout de côté : x → y (profondeur), hauteur → z
  const planks = [
    mk(`Face avant ${k}`, l, H, [0, -L / 2 + t / 2, z], wall, { top: { n: nl, phase: 0 }, bottom: { n: nl, phase: 0 }, left: { n: nH, phase: 0 }, right: { n: nH, phase: 0 } }),
    mk(`Face arrière ${k}`, l, H, [0, L / 2 - t / 2, z], wall, { top: { n: nl, phase: 0 }, bottom: { n: nl, phase: 0 }, left: { n: nH, phase: 0 }, right: { n: nH, phase: 0 } }),
    mk(`Côté droit ${k}`, L, H, [l / 2 - t / 2, 0, z], side, { top: { n: nL, phase: 0 }, bottom: { n: nL, phase: 0 }, left: { n: nH, phase: 1 }, right: { n: nH, phase: 1 } }),
    mk(`Côté gauche ${k}`, L, H, [-l / 2 + t / 2, 0, z], side, { top: { n: nL, phase: 0 }, bottom: { n: nL, phase: 0 }, left: { n: nH, phase: 1 }, right: { n: nH, phase: 1 } }),
    mk(`Dessus ${k}`, l, L, [0, 0, H - t / 2], [0, 0, 0], { top: { n: nl, phase: 1 }, bottom: { n: nl, phase: 1 }, left: { n: nL, phase: 1 }, right: { n: nL, phase: 1 } }),
    mk(`Dessous ${k}`, l, L, [0, 0, t / 2], [0, 0, 0], { top: { n: nl, phase: 1 }, bottom: { n: nl, phase: 1 }, left: { n: nL, phase: 1 }, right: { n: nL, phase: 1 } }),
  ];
  return { planks, group, name: `Boîte ${k}` };
}
