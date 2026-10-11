import { describe, expect, it } from 'vitest';
import { rotate } from '@/birdhouse/model/math/rotation';
import {
  bounds, castellation, corners, edgeLength, extents, fitHole, holeHalf, holeOutline, moveWithGroup, movingWith,
  outline, pullFace, recastAll, rectUnion, rotFromBasis, slotsForTeeth, teethFor, toZUp, transformPlanks,
  fromAxisAngle, fromEulerDeg, makeBox,
  type Hole, type Plank, type PlankScene, type Pt, type Vec3,
} from '@/birdhouse/model';

const mk = (over: Partial<Plank> & { id: string }): Plank => ({ name: over.id, w: 10, h: 10, pos: [0, 0, 0], rot: [0, 0, 0], notches: [], holes: [], ...over });
const scene = (planks: Plank[], over: Partial<PlankScene> = {}): PlankScene => ({ t: 3, fit: 0, planks, up: 'z2', ...over });
/** Évite les -0 (toEqual distingue +0 et -0). */
const nz = (v: number[]): number[] => v.map((x) => x + 0);
const area = (poly: Pt[]): number => { let s = 0; for (let i = 0; i < poly.length; i++) { const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length]; s += x0 * y1 - x1 * y0; } return s / 2; };

describe('castellation', () => {
  it('edgeLength : w pour haut / bas, h pour gauche / droite', () => {
    const p = mk({ id: 'a', w: 30, h: 20 });
    expect([edgeLength(p, 'top'), edgeLength(p, 'bottom'), edgeLength(p, 'left'), edgeLength(p, 'right')]).toEqual([30, 30, 20, 20]);
  });
  it('une dent sur deux est creusée, selon la phase', () => {
    const p = mk({ id: 'a', w: 90, h: 20 });
    const n0 = castellation(p, 'top', 5, 0, 3, 0.2), n1 = castellation(p, 'top', 5, 1, 3, 0.2);
    expect(n0.map((n) => n.pos)).toEqual([9, 45, 81]);
    expect(n1.map((n) => n.pos)).toEqual([27, 63]);
    expect(n0.every((n) => n.width === 18.2 && n.depth === 3 && n.edge === 'top')).toBe(true);
  });
  it('teethFor : impair, au moins 3, dent ≈ 16 mm', () => {
    expect(teethFor(10)).toBe(3);
    expect(teethFor(100)).toBe(7); // round(6,25) = 6 → pair → 7
    expect(teethFor(112)).toBe(7);
    expect(teethFor(160)).toBe(11); // 10 → 11
  });
  it('recastAll : sans crénelage la plaque est rendue telle quelle (même référence)', () => {
    const p = mk({ id: 'a' });
    expect(recastAll(p, 3, 0)).toBe(p);
  });
  it('recastAll : refait les crans des bords crénelés avec la nouvelle épaisseur, garde les autres', () => {
    const other = { id: 'x', edge: 'left' as const, pos: 5, width: 2, depth: 1 };
    const p = mk({ id: 'a', w: 48, h: 20, cast: { top: { n: 3, phase: 0 } }, notches: [other, { id: 'y', edge: 'top', pos: 1, width: 1, depth: 1 }] });
    const r = recastAll(p, 5, 0);
    expect(r.notches).toHaveLength(3); // other + deux dents creuses (0 et 2)
    expect(r.notches[0]).toBe(other);
    expect(r.notches.slice(1).map((n) => [n.edge, n.pos, n.width, n.depth])).toEqual([['top', 8, 16, 5], ['top', 40, 16, 5]]);
  });
});

describe('trous', () => {
  const sq = (over: Partial<Hole>): Hole => ({ id: 'h', shape: 'square', x: 0, y: 0, size: 10, ...over });
  it('holeHalf : rond = diamètre / 2, rectangle = size × sh (sh = size par défaut)', () => {
    expect(holeHalf({ id: 'h', shape: 'round', x: 0, y: 0, size: 8, sh: 99 })).toEqual([4, 4]);
    expect(holeHalf(sq({ size: 10, sh: 6 }))).toEqual([5, 3]);
    expect(holeHalf(sq({ size: 10 }))).toEqual([5, 5]);
  });
  it('fitHole : un trou trop grand est réduit puis recentré avec 1 mm de bord', () => {
    const p = mk({ id: 'a', w: 40, h: 20 });
    const r = fitHole(p, sq({ size: 100, sh: 100, r: 50, x: 500, y: -500 }));
    expect(r).toMatchObject({ size: 38, sh: 18, r: 9, x: 0, y: 0 });
    const round = fitHole(p, { id: 'h', shape: 'round', x: 30, y: 30, size: 60 });
    expect(round).toMatchObject({ size: 18, sh: undefined, r: undefined, x: 10, y: 0 });
  });
  it('fitHole : un trou qui dépasse du bord est ramené à 1 mm, au centième', () => {
    const p = mk({ id: 'a', w: 100, h: 50 });
    expect(fitHole(p, sq({ size: 10, sh: 4, x: 49, y: -24 }))).toMatchObject({ x: 44, y: -22 });
    expect(fitHole(p, sq({ size: 10, sh: 4, x: 1.234, y: 2.345 }))).toMatchObject({ x: 1.23, y: 2.35 }); // déjà dedans : arrondi au centième seulement
  });
  it('fitHole : plaque minuscule, au moins 1 mm de trou', () => {
    const p = mk({ id: 'a', w: 1, h: 1 });
    expect(fitHole(p, sq({ size: 5 }))).toMatchObject({ size: 1, sh: 1 });
  });
  it('holeOutline : contour libre prioritaire', () => {
    const poly: Pt[] = [[0, 0], [1, 0], [0, 1]];
    expect(holeOutline(sq({ poly }))).toBe(poly);
  });
  it('holeOutline : rectangle à coins droits, sens trigonométrique', () => {
    expect(holeOutline(sq({ x: 1, y: 2, size: 4, sh: 2 }))).toEqual([[-1, 1], [3, 1], [3, 3], [-1, 3]]);
    expect(holeOutline(sq({ size: 4, sh: 2, r: 0.04 }))).toHaveLength(4); // rayon négligeable
  });
  it('holeOutline : coins arrondis = 4 × 9 points, aire = rectangle − (4 − π) r²', () => {
    const o = holeOutline(sq({ size: 20, sh: 10, r: 3 }));
    expect(o).toHaveLength(36);
    expect(area(o)).toBeCloseTo(200 - 4 * (9 - 4 * 9 * Math.sin(Math.PI / 16)), 9); // 8 triangles par quart de cercle
    const big = holeOutline(sq({ size: 20, sh: 10, r: 99 })); // rayon plafonné à la demi-largeur
    expect(big.length).toBe(36);
    expect(Math.min(...big.map((p) => p[1]))).toBeCloseTo(-5, 9);
  });
  it('holeOutline : rond = 32 points sur le cercle', () => {
    const o = holeOutline({ id: 'h', shape: 'round', x: 5, y: 0, size: 10 });
    expect(o).toHaveLength(32);
    expect(o.every(([x, y]) => Math.abs(Math.hypot(x - 5, y) - 5) < 1e-9)).toBe(true);
    expect(o[0]).toEqual([10, 0]);
  });
  it('rectUnion : liste vide ou rectangle sans surface → []', () => {
    expect(rectUnion([])).toEqual([]);
    expect(rectUnion([[1, 1, 1, 1]])).toEqual([]);
  });
  it('rectUnion : un rectangle → ses 4 coins ; un L → 6 sommets, aire exacte, points alignés retirés', () => {
    const r = rectUnion([[0, 0, 4, 2]]);
    expect(r).toHaveLength(4);
    expect(area(r)).toBe(8);
    const L = rectUnion([[0, 0, 4, 2], [0, 2, 2, 5], [0, 1, 4, 1.5]]);
    expect(L).toHaveLength(6);
    expect(area(L)).toBeCloseTo(8 + 6, 9);
  });
});

describe('outline', () => {
  const sheet = mk({ id: 'a', w: 100, h: 50 });
  it('rectangle sans cran : 4 coins, sens trigonométrique', () => {
    expect(outline(sheet)).toEqual([[-50, -25], [50, -25], [50, 25], [-50, 25]]);
  });
  it('contour libre : copié', () => {
    const poly: Pt[] = [[0, 0], [5, 0], [0, 5]];
    const o = outline({ ...sheet, poly });
    expect(o).toEqual(poly);
    expect(o).not.toBe(poly);
  });
  it('cran au milieu du bord bas : aire = rectangle − cran', () => {
    const p = { ...sheet, notches: [{ id: 'n', edge: 'bottom' as const, pos: 50, width: 10, depth: 4 }] };
    expect(area(outline(p))).toBe(5000 - 40);
  });
  it('cran qui sort du bord : rogné ; profondeur plafonnée à la hauteur − 1', () => {
    const p = { ...sheet, notches: [{ id: 'n', edge: 'top' as const, pos: 2, width: 10, depth: 500 }] };
    expect(area(outline(p))).toBe(5000 - 7 * 49); // s = W - 2 = 98, de 93 à 100 : 7 de large
  });
  it('cran minuscule (< 0,2 mm) ignoré', () => {
    const p = { ...sheet, notches: [{ id: 'n', edge: 'left' as const, pos: 10, width: 0.1, depth: 4 }] };
    expect(outline(p)).toEqual(outline(sheet));
  });
  it('deux crans qui se chevauchent : le second, contenu dans le premier, est sauté', () => {
    const p = { ...sheet, notches: [{ id: 'a', edge: 'bottom' as const, pos: 20, width: 20, depth: 5 }, { id: 'b', edge: 'bottom' as const, pos: 16, width: 8, depth: 5 }] };
    expect(area(outline(p))).toBe(5000 - 100);
  });
  it('crans de coin (A large et plat, B étroit et profond) : aire = rectangle − union', () => {
    const p = { ...sheet, notches: [{ id: 'a', edge: 'bottom' as const, pos: 90, width: 20, depth: 5 }, { id: 'b', edge: 'right' as const, pos: 4, width: 8, depth: 4 }] };
    // A = 20 (le long du bord) × 5 ; B = 4 × 8 : union = 100 + 32 − (4 × 5) = 112
    expect(area(outline(p))).toBeCloseTo(5000 - 112, 9);
  });
  it('crans de coin (A étroit et profond, B large et peu profond) : aire = rectangle − union', () => {
    // A : 4 de large (le long du bord bas), 10 de profond ; B : 4 de large (le long du bord droit), 10 de profond
    // dans le repère du coin : A = [0,4] × [0,10], B = [0,10] × [0,4] → union = 40 + 40 − 16 = 64
    const p = { ...sheet, notches: [{ id: 'a', edge: 'bottom' as const, pos: 98, width: 4, depth: 10 }, { id: 'b', edge: 'right' as const, pos: 2, width: 4, depth: 10 }] };
    expect(area(outline(p))).toBeCloseTo(5000 - 64, 9);
  });
  it('cran de coin sur le bord haut → bord gauche : un seul cran A', () => {
    const p = { ...sheet, notches: [{ id: 'a', edge: 'top' as const, pos: 2, width: 6, depth: 3 }] }; // [95, 101] rogné à [95, 100] : 5 de large
    expect(area(outline(p))).toBeCloseTo(5000 - 5 * 3, 9);
  });
  it('B plus long que A le long du bord k (wB > dA) : aire = rectangle − union', () => {
    // A = [0,10] × [0,2] (wA = 10, dA = 2), B = [0,3] × [0,10] (dB = 3, wB = 10) → wA >= dB ; wB > dA
    const p = { ...sheet, notches: [{ id: 'a', edge: 'bottom' as const, pos: 95, width: 10, depth: 2 }, { id: 'b', edge: 'right' as const, pos: 5, width: 10, depth: 3 }] };
    expect(area(outline(p))).toBeCloseTo(5000 - (20 + 30 - 6), 9);
  });
});

describe('transformations (rotation, bornes)', () => {
  it('rotFromBasis : x → x, y → z = rotation de 90° autour de x', () => {
    expect(nz(rotFromBasis([1, 0, 0], [0, 0, 1]))).toEqual([90, 0, 0]);
    for (const [bx, by] of [[[0, 1, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0]], [[-1, 0, 0], [0, 1, 0]]] as [Vec3, Vec3][]) { // la rotation envoie x local sur bx et y local sur by
      const q = fromEulerDeg(rotFromBasis(bx, by));
      expect(rotate([1, 0, 0], q).map((v) => Math.round(v) + 0)).toEqual(bx);
      expect(rotate([0, 1, 0], q).map((v) => Math.round(v) + 0)).toEqual(by);
    }
    expect(nz(rotFromBasis([1, 0, 0], [0, 1, 0]))).toEqual([0, 0, 0]);
  });
  it('toZUp : scène déjà en z2 rendue telle quelle', () => {
    const s = scene([mk({ id: 'a' })]);
    expect(toZUp(s)).toBe(s);
  });
  it('toZUp : ancien repère (sans up) → (x, y, z) devient (x, −z, y), rotation composée avec Rx(90°)', () => {
    const s: PlankScene = { t: 3, fit: 0, planks: [mk({ id: 'a', pos: [1, 2, 3], rot: [0, 0, 90] })] };
    const r = toZUp(s);
    expect(r.up).toBe('z2');
    expect(r.planks[0].pos).toEqual([1, -3, 2]);
    expect(nz(r.planks[0].rot)).toEqual([90, 0, 90]); // Rx90 · Rz90
  });
  it('toZUp : les anciens repères \'z\' et \'z1\' sont réparés vers la même rotation, positions inchangées', () => {
    const z: PlankScene = { t: 3, fit: 0, up: 'z', planks: [mk({ id: 'a', pos: [1, 2, 3], rot: [0, -90, 0] })] }; // Rx90 · Rz90 · Rx−90 = Ry−90
    const z1: PlankScene = { t: 3, fit: 0, up: 'z1', planks: [mk({ id: 'a', pos: [1, 2, 3], rot: [90, -90, 0] })] }; // Rx90 · Ry−90
    for (const s of [z, z1]) {
      const r = toZUp(s);
      expect(r.up).toBe('z2');
      expect(r.planks[0].pos).toEqual([1, 2, 3]);
      expect(nz(r.planks[0].rot)).toEqual([90, 0, 90]);
    }
  });
  it('bounds : boîte englobante exacte, plaque tournée et épaisseur propre (depth)', () => {
    const a = mk({ id: 'a', w: 10, h: 4, pos: [1, 2, 3] });
    expect(bounds([a], 2)).toEqual({ min: [-4, 0, 2], max: [6, 4, 4] });
    const b = mk({ id: 'b', w: 10, h: 4, rot: [0, 0, 90], depth: 6 });
    const bb = bounds([b], 2);
    expect(bb.min.map((v) => Math.round(v * 1e6) / 1e6 + 0)).toEqual([-2, -5, -3]);
    expect(bb.max.map((v) => Math.round(v * 1e6) / 1e6 + 0)).toEqual([2, 5, 3]);
    const both = bounds([a, b], 2);
    expect(both.min[0]).toBeCloseTo(-4, 9);
    expect(both.max[1]).toBeCloseTo(5, 9);
  });
  it('corners : plaque seule → 8 coins de la dalle tournée ; plusieurs → boîte englobante', () => {
    const a = mk({ id: 'a', w: 4, h: 2, pos: [10, 0, 0], rot: [0, 0, 90] });
    const c = corners([a], 2);
    expect(c).toHaveLength(8);
    expect(c.map((p) => p.map((v) => Math.round(v * 1e6) / 1e6 + 0)).sort()).toEqual([
      [9, -2, -1], [9, -2, 1], [9, 2, -1], [9, 2, 1], [11, -2, -1], [11, -2, 1], [11, 2, -1], [11, 2, 1],
    ].sort());
    const b = mk({ id: 'b', w: 2, h: 2, pos: [0, 0, 0] });
    const many = corners([a, b], 2);
    expect(many).toHaveLength(8);
    expect(many[0]).toEqual([-1, -2, -1]);
    expect(many[7]).toEqual([11, 2, 1]);
  });
  it('extents : encombrement arrondi, [0, 0, 0] pour rien', () => {
    expect(extents([], 3)).toEqual([0, 0, 0]);
    expect(extents([mk({ id: 'a', w: 10.4, h: 4, pos: [0, 0, 0] })], 3)).toEqual([10, 4, 3]);
  });
  it('movingWith : seulement le groupe, sans la plaque elle-même', () => {
    const a = mk({ id: 'a', group: 'g' }), b = mk({ id: 'b', group: 'g' }), c = mk({ id: 'c' });
    const s = scene([a, b, c]);
    expect(movingWith(s, a).map((p) => p.id)).toEqual(['b']);
    expect(movingWith(s, c)).toEqual([]);
  });
  it('transformPlanks : rotation autour du pivot puis translation, positions au centième', () => {
    const a = mk({ id: 'a', pos: [10, 0, 0] }), b = mk({ id: 'b', pos: [3, 3, 3] });
    const s = transformPlanks(scene([a, b]), new Set(['a']), [1, 2, 3], fromAxisAngle([0, 0, 1], Math.PI / 2), [0, 0, 0]);
    expect(s.planks[0].pos).toEqual([1, 12, 3]);
    expect(nz(s.planks[0].rot)).toEqual([0, 0, 90]);
    expect(s.planks[1]).toBe(b);
  });
  it('moveWithGroup : la plaque menée prend ce qu\'on lui donne, son groupe la suit en bloc', () => {
    const a = mk({ id: 'a', group: 'g' }), b = mk({ id: 'b', group: 'g', pos: [10, 0, 0] }), c = mk({ id: 'c', pos: [10, 0, 0] });
    const s = scene([a, b, c]);
    const r = moveWithGroup(s, 'a', [5, 0, 0], [0, 0, 90]);
    expect(r.planks[0]).toMatchObject({ pos: [5, 0, 0], rot: [0, 0, 90] });
    expect(r.planks[1].pos).toEqual([5, 10, 0]);
    expect(nz(r.planks[1].rot)).toEqual([0, 0, 90]);
    expect(r.planks[2]).toBe(c);
  });
  it('moveWithGroup : plaque inconnue → même scène ; plaque seule → juste elle', () => {
    const a = mk({ id: 'a' });
    const s = scene([a]);
    expect(moveWithGroup(s, 'zzz', [1, 1, 1], [0, 0, 0])).toBe(s);
    expect(moveWithGroup(s, 'a', [1, 2, 3], [0, 90, 0]).planks[0]).toMatchObject({ pos: [1, 2, 3], rot: [0, 90, 0] });
  });
});

describe('pullFace', () => {
  // P : dalle horizontale 100 × 50 ; Q : mur dont la normale est x, contre la face x+ ; R : plaque verticale dont x local = x monde ;
  // S : plaque horizontale dont y local = x monde ; U : plaque à 45°, quelconque ; V : plaque dans un autre groupe ; W : plaque loin de la face.
  const build = (): PlankScene => scene([
    mk({ id: 'P', w: 100, h: 50, pos: [0, 0, 1.5], group: 'g' }),
    mk({ id: 'Q', w: 50, h: 50, pos: [51.5, 0, 1.5], rot: [0, 90, 0], group: 'g' }),
    mk({ id: 'R', w: 100, h: 100, pos: [0, 26.5, 1.5], rot: [90, 0, 0], group: 'g' }),
    mk({ id: 'S', w: 50, h: 100, pos: [0, 40, 1.5], rot: [0, 0, 90], group: 'g' }),
    mk({ id: 'U', w: 10, h: 10, pos: [48, 0, 1.5], rot: [0, 45, 0], group: 'g' }),
    mk({ id: 'V', w: 100, h: 50, pos: [0, 0, 1.5], group: 'other' }),
    mk({ id: 'W', w: 10, h: 10, pos: [-40, 0, 1.5], group: 'g' }),
  ]);
  const get = (s: PlankScene, id: string) => s.planks.find((p) => p.id === id)!;

  it('tire la face x+ : la plaque s\'allonge, ce qui affleure suit (déplacé, allongé), le reste ne bouge pas', () => {
    const s = build();
    const r = pullFace(s, 'P', 'x', 1, 10);
    expect(r.applied).toBe(10);
    expect(get(r.scene, 'P')).toMatchObject({ w: 110, pos: [5, 0, 1.5] });
    expect(get(r.scene, 'Q').pos).toEqual([61.5, 0, 1.5]); // normale ∥ N : déplacée
    expect(get(r.scene, 'R')).toMatchObject({ w: 110, pos: [5, 26.5, 1.5] }); // x local ∥ N : allongée, bord opposé fixe
    expect(get(r.scene, 'S')).toMatchObject({ h: 110, pos: [5, 40, 1.5] }); // y local ∥ N
    expect(get(r.scene, 'U').pos).toEqual([58, 0, 1.5]); // oblique : déplacée
    expect(get(r.scene, 'V')).toBe(get(s, 'V')); // autre groupe
    expect(get(r.scene, 'W')).toBe(get(s, 'W')); // loin de la face
  });
  it('pousse la face x− (sign −1) : la plaque s\'allonge vers −x', () => {
    const r = pullFace(scene([mk({ id: 'P', w: 100, h: 50 })]), 'P', 'x', -1, 10);
    expect(r.applied).toBe(10);
    expect(get(r.scene, 'P')).toMatchObject({ w: 110, pos: [-5, 0, 0] });
  });
  it('face y d\'une plaque seule : sa hauteur change', () => {
    const r = pullFace(scene([mk({ id: 'P', w: 100, h: 50 })]), 'P', 'y', 1, -20);
    expect(get(r.scene, 'P')).toMatchObject({ h: 30, pos: [0, -10, 0] });
  });
  it('face z : la plaque entière se déplace (épaisseur inchangée)', () => {
    const r = pullFace(scene([mk({ id: 'P' })]), 'P', 'z', 1, 7);
    expect(get(r.scene, 'P')).toMatchObject({ w: 10, h: 10, pos: [0, 0, 7] });
  });
  it('minimum 1 mm : le raccourcissement est plafonné par la plus petite plaque', () => {
    const r = pullFace(build(), 'P', 'x', 1, -150);
    expect(r.applied).toBe(-99);
    expect(get(r.scene, 'P').w).toBe(1);
    expect(get(r.scene, 'R').w).toBe(1);
    // déjà au minimum : plus rien à faire, même scène
    const again = pullFace(r.scene, 'P', 'x', 1, -5);
    expect(again.applied).toBe(0);
    expect(again.scene).toBe(r.scene);
  });
  it('d = 0 ou plaque inconnue : rien ne change', () => {
    const s = build();
    expect(pullFace(s, 'P', 'x', 1, 0)).toEqual({ scene: s, applied: 0 });
    expect(pullFace(s, 'zzz', 'x', 1, 5)).toEqual({ scene: s, applied: 0 });
  });
  it('recrénelle les plaques allongées avec leur nouvelle longueur', () => {
    const p = mk({ id: 'P', w: 48, h: 20, cast: { top: { n: 3, phase: 0 } }, notches: castellation(mk({ id: 'P', w: 48, h: 20 }), 'top', 3, 0, 3, 0) });
    const r = pullFace(scene([p]), 'P', 'x', 1, 16);
    expect(get(r.scene, 'P').w).toBe(64);
    expect(get(r.scene, 'P').notches.map((n) => n.pos)).toEqual([10.67, 53.33]); // dents de 64 / 3, creuses : 0 et 2
  });
});

describe('slotsForTeeth', () => {
  const B = (over: Partial<Plank> = {}): Plank => mk({ id: 'B', w: 100, h: 100, ...over });
  const wall = rotFromBasis([1, 0, 0], [0, 0, 1]); // mur debout, face à −y
  const A = (over: Partial<Plank> = {}): Plank => mk({ id: 'A', w: 60, h: 40, rot: wall, ...over });

  it('un mur qui traverse la plaque donne une fente longueur × épaisseur (+ jeu)', () => {
    const r = slotsForTeeth(scene([B(), A()], { fit: 0.5 }), 'B');
    expect(r.added).toBe(1);
    expect(r.planks).toBe(1);
    const h = r.scene.planks.find((p) => p.id === 'B')!.holes[0];
    expect(h).toMatchObject({ shape: 'square', x: 0, y: 0, size: 60.5, sh: 3.5 });
  });
  it('les fentes déjà présentes ne sont pas doublées (même scène rendue)', () => {
    const first = slotsForTeeth(scene([B(), A()]), 'B');
    const again = slotsForTeeth(first.scene, 'B');
    expect(again).toEqual({ scene: first.scene, added: 0, planks: 0 });
    expect(again.scene.planks.find((p) => p.id === 'B')!.holes).toHaveLength(1);
  });
  it("un trou carré déjà présent (sans sh) au même endroit mais de forme différente n'empêche pas la fente", () => {
    const existing: Hole = { id: 'e', shape: 'square', x: 0, y: 0, size: 60 }; // 60 × 60 (sh absent = size) ; la fente est 60 × 3
    const r = slotsForTeeth(scene([B({ holes: [existing] }), A()]), 'B');
    expect(r.added).toBe(1);
    expect(r.scene.planks.find((p) => p.id === 'B')!.holes).toHaveLength(2);
  });
  it('un cran dans le mur raccourcit la dent', () => {
    const notch = { id: 'n', edge: 'left' as const, pos: 20, width: 10, depth: 5 };
    const r = slotsForTeeth(scene([B(), A({ notches: [notch] })]), 'B');
    const h = r.scene.planks.find((p) => p.id === 'B')!.holes[0];
    expect(r.added).toBe(1);
    expect(h.size).toBe(55); // de −25 à 30
    expect(h.x).toBe(2.5);
  });
  it('plaque inconnue, plaque parallèle, même groupe, dent qui n\'arrive pas, dent minuscule, diagonale : rien', () => {
    const s = scene([B()]);
    expect(slotsForTeeth(s, 'zzz')).toEqual({ scene: s, added: 0, planks: 0 });
    const cases: Plank[] = [
      mk({ id: 'A', w: 60, h: 40, pos: [0, 0, 20] }), // parallèle
      A({ group: 'g' }), // même groupe (B est dans g aussi, ci-dessous)
      A({ pos: [200, 0, 0] }), // loin de B
      A({ w: 0.4 }), // dent de 0,4 mm
      A({ rot: rotFromBasis([Math.SQRT1_2, Math.SQRT1_2, 0], [0, 0, 1]) }), // mur à 45° : fente en diagonale
    ];
    for (const a of cases) {
      const b = a.group ? B({ group: 'g' }) : B();
      const sc = scene([b, a]);
      const r = slotsForTeeth(sc, 'B');
      expect(r).toEqual({ scene: sc, added: 0, planks: 0 });
    }
  });
});

describe('boîte (makeBox)', () => {
  it('six plaques liées aux dimensions de la boîte, dessous sur z = 0', () => {
    const b = makeBox(100, 80, 60, 3, 0.4);
    expect(b.planks.map((p) => p.name)).toEqual(['Face avant 1', 'Face arrière 1', 'Côté droit 1', 'Côté gauche 1', 'Dessus 1', 'Dessous 1']);
    expect(b.name).toBe('Boîte 1');
    expect(new Set(b.planks.map((p) => p.group))).toEqual(new Set([b.group]));
    const bb = bounds(b.planks, 3);
    expect(bb.min.map((v) => Math.round(v * 1e6) / 1e6 + 0)).toEqual([-50, -40, 0]);
    expect(bb.max.map((v) => Math.round(v * 1e6) / 1e6 + 0)).toEqual([50, 40, 60]);
  });
  it('le jeu demandé est ignoré (crans ajustés), numérotation par start', () => {
    const b = makeBox(100, 80, 60, 3, 5, 4);
    expect(b.name).toBe('Boîte 4');
    expect(b.planks[0].name).toBe('Face avant 4');
    const front = b.planks[0];
    // 7 dents sur 100 mm : 4 creuses (phase 0) de 100 / 7 de large, sans jeu
    const top = front.notches.filter((n) => n.edge === 'top');
    expect(top).toHaveLength(4);
    expect(top[0].width).toBe(+(100 / 7).toFixed(2));
    expect(top[0].depth).toBe(3);
  });
  it('une arête réunit un bord creux et un bord plein (les dents s\'emboîtent)', () => {
    const b = makeBox(100, 80, 60, 3, 0);
    const front = b.planks[0], right = b.planks[2];
    const hollowFront = front.notches.filter((n) => n.edge === 'right').map((n) => n.pos);
    const hollowRight = right.notches.filter((n) => n.edge === 'left' || n.edge === 'right').map((n) => n.pos);
    expect(hollowFront.length).toBeGreaterThan(0);
    // positions disjointes sur la hauteur : 0 et 1 sont complémentaires
    expect(hollowFront.every((x) => !hollowRight.includes(x))).toBe(true);
  });
});
