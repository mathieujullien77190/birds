// @vitest-environment jsdom
// Cotes (dimension, étiquette sur canvas) et repères de la vue (face à tirer, plan de coupe, cotes de l'habillage), sans WebGL : le canvas 2D est doublé.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LineLoop, LineSegments, Mesh, PlaneGeometry, Sprite, Vector3 } from 'three';
import { bounds, extents, outline, type Plank, type PlankScene } from '@/birdhouse/model';
import { MARK } from '@/birdhouse/three/constants';
import { dimension } from '@/birdhouse/three/factories/dimension';
import { cutMarkObject, habillageDimensions, pullMarkObject } from '@/birdhouse/three/factories/marks';
import { disposeAll, materials } from '@/birdhouse/three/registry/materials';

const P = (over: Partial<Plank>): Plank => ({ id: 'p', name: 'p', w: 100, h: 60, pos: [0, 0, 0], rot: [0, 0, 0], notches: [], holes: [], ...over });
const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

let texts: string[];
beforeEach(() => {
  texts = [];
  const ctx = { measureText: (s: string) => ({ width: s.length * 10 }), beginPath: () => {}, roundRect: vi.fn(), fill: () => {}, stroke: () => {}, fillText: (s: string) => { texts.push(s); }, font: '', fillStyle: '', strokeStyle: '', lineWidth: 0, textAlign: '', textBaseline: '' };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
});
afterEach(() => { vi.restoreAllMocks(); disposeAll(); });

describe('dimension : une cote', () => {
  const a = v(0, 0, 0), b = v(100, 0, 0), tick = v(0, -1, 0), off = v(0, -14, 0);
  it('contient trait + barres, traits de rappel et étiquette, dans cet ordre, aux matériaux testés en profondeur du registre', () => {
    const g = dimension(a, b, tick, off, '100');
    expect(g.children.map((c) => c.type)).toEqual(['LineSegments', 'LineSegments', 'Sprite']);
    const [main, ext, sp] = g.children as [LineSegments, LineSegments, Sprite];
    expect(main.material).toBe(materials.dimLine());
    expect(ext.material).toBe(materials.dimExtension());
    expect(sp.material.depthTest).toBe(true); // testée en profondeur : cachée derrière le bois
  });
  it('trait de a à b puis barres de 4 mm aux deux bouts, le long de tick', () => {
    const [main] = dimension(a, b, tick, off, '100').children as [LineSegments];
    const p = main.geometry.attributes.position, pts = Array.from({ length: p.count }, (_, i) => [p.getX(i), p.getY(i), p.getZ(i)]);
    expect(pts).toEqual([[0, 0, 0], [100, 0, 0], [0, 4, 0], [0, -4, 0], [100, 4, 0], [100, -4, 0]]);
  });
  it('traits de rappel : de chaque bout décalé de −off jusqu’au bout lui-même', () => {
    const [, ext] = dimension(a, b, tick, off, '100').children as [LineSegments, LineSegments];
    const p = ext.geometry.attributes.position, pts = Array.from({ length: p.count }, (_, i) => [p.getX(i), p.getY(i), p.getZ(i)]);
    expect(pts).toEqual([[0, 14, 0], [0, 0, 0], [100, 14, 0], [100, 0, 0]]);
  });
  it("étiquette : le texte est dessiné, au milieu de a-b décalé de 9 × tick, 60 × 13,5, au-dessus de tout", () => {
    const g = dimension(a, b, tick, off, '100 mm');
    const sp = g.children[2] as Sprite;
    expect(texts).toEqual(['100 mm']);
    expect(sp.position.toArray()).toEqual([50, -9, 0]);
    expect(sp.scale.toArray()).toEqual([60, 13.5, 1]);
    expect(sp.renderOrder).toBe(MARK.dimensionRenderOrder);
    expect(sp.material.transparent).toBe(true);
    expect(sp.material.map).not.toBeNull();
  });
  it("ne modifie pas ses arguments", () => {
    const aa = a.clone(), tt = tick.clone(), oo = off.clone();
    dimension(a, b, tick, off, 'x');
    expect([a, tick, off].map((x) => x.toArray())).toEqual([aa, tt, oo].map((x) => x.toArray()));
  });
});

describe('pullMarkObject : contour de la face à tirer', () => {
  const p = P({ w: 100, h: 60 }), t = 3, o = MARK.pullOffset;
  const r4 = (x: number) => Math.round(x * 1e4) / 1e4 || 0; // positions stockées en float32
  const pts = (l: LineLoop) => { const q = l.geometry.attributes.position; return Array.from({ length: q.count }, (_, i) => [r4(q.getX(i)), r4(q.getY(i)), r4(q.getZ(i))]); };
  it('face z : le contour de la plaque posé sur la face, sens + ou −', () => {
    for (const sign of [1, -1] as const) {
      const l = pullMarkObject(p, { plankId: 'p', axis: 'z', sign }, t), q = pts(l);
      expect(q).toHaveLength(outline(p).length);
      for (const [, , z] of q) expect(z).toBeCloseTo(sign * (t / 2 + o), 3);
      expect(q.map(([x, y]) => [x, y])).toEqual(outline(p).map(([x, y]) => [r4(x), r4(y)]));
    }
  });
  it('face x : rectangle dans le plan x = ± (w/2 + 0,3)', () => {
    const q = pts(pullMarkObject(p, { plankId: 'p', axis: 'x', sign: -1 }, t)), x = -(50 + o), h2 = 30 + o, t2 = 1.5 + o;
    expect(q).toEqual([[x, -h2, -t2], [x, h2, -t2], [x, h2, t2], [x, -h2, t2]]);
  });
  it('face y : rectangle dans le plan y = ± (h/2 + 0,3)', () => {
    const q = pts(pullMarkObject(p, { plankId: 'p', axis: 'y', sign: 1 }, t)), y = 30 + o, w2 = 50 + o, t2 = 1.5 + o;
    expect(q).toEqual([[-w2, y, -t2], [w2, y, -t2], [w2, y, t2], [-w2, y, t2]]);
  });
  it('pointillés : distances calculées, matériau du registre, dessiné par-dessus', () => {
    const l = pullMarkObject(p, { plankId: 'p', axis: 'z', sign: 1 }, t);
    expect(l.geometry.attributes.lineDistance).toBeDefined();
    expect(l.material).toBe(materials.pullMark());
    expect(l.renderOrder).toBe(MARK.pullRenderOrder);
  });
});

describe('cutMarkObject : plan de coupe', () => {
  const planks = [P({ id: 'a', w: 100, h: 60, pos: [10, 20, 30] })], t = 3;
  it("rend null sans coupe active ou sans plaque", () => {
    expect(cutMarkObject(planks, t, { on: false, axis: 'x', pos: 0, flip: false })).toBeNull();
    expect(cutMarkObject([], t, { on: true, axis: 'x', pos: 0, flip: false })).toBeNull();
  });
  it("le carré est centré sur la scène, sauf sur l'axe de coupe où il est à `pos`, orienté selon la normale de l'axe", () => {
    const { min, max } = bounds(planks, t), c = [0, 1, 2].map((i) => (min[i] + max[i]) / 2);
    for (const [axis, i, n] of [['x', 0, [1, 0, 0]], ['y', 1, [0, 1, 0]], ['z', 2, [0, 0, 1]]] as const) {
      const m = cutMarkObject(planks, t, { on: true, axis, pos: 77, flip: false })!;
      expect(m).toBeInstanceOf(Mesh);
      const want = c.map((x, k) => (k === i ? 77 : x));
      m.position.toArray().forEach((x, k) => expect(x).toBeCloseTo(want[k], 9));
      const normal = new Vector3(0, 0, 1).applyQuaternion(m.quaternion);
      normal.toArray().forEach((x, k) => expect(x).toBeCloseTo(n[k], 9));
      expect(m.material).toBe(materials.cut());
      expect(m.renderOrder).toBe(MARK.cutRenderOrder);
    }
  });
  it('taille = 140 % du plus grand côté, au moins 140 % de 50 mm pour une toute petite scène', () => {
    const big = cutMarkObject(planks, t, { on: true, axis: 'z', pos: 0, flip: false })!, { min, max } = bounds(planks, t);
    const side = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    expect((big.geometry as PlaneGeometry).parameters.width).toBeCloseTo(side * 1.4, 9);
    const tiny = cutMarkObject([P({ w: 5, h: 5 })], 1, { on: true, axis: 'z', pos: 0, flip: false })!;
    expect((tiny.geometry as PlaneGeometry).parameters.width).toBeCloseTo(50 * 1.4, 9);
  });
});

describe('habillageDimensions : cotes de l\'habillage seulement', () => {
  const sc = (planks: Plank[], names: Record<string, string> | undefined): PlankScene => ({ t: 3, fit: 0, planks, groupNames: names });
  const lame = (id: string, x: number, g?: string) => P({ id, w: 20, h: 40, pos: [x, 0, 20], group: g });
  it("trois cotes (l, L, H) pour un groupe « Habillage », positionnées autour de son encombrement", () => {
    const planks = [lame('a', 0, 'g'), lame('b', 100, 'g')], s = sc(planks, { g: 'Habillage' });
    const out = habillageDimensions(s, new Set());
    expect(out).toHaveLength(3);
    const { min, max } = bounds(planks, 3), [l, L, H] = extents(planks, 3), O = MARK.dimensionGap;
    expect(texts).toEqual([`${l}`, `${L}`, `${H}`]);
    const seg = (i: number) => { const p = ((out[i].children[0]) as LineSegments).geometry.attributes.position; return [new Vector3(p.getX(0), p.getY(0), p.getZ(0)), new Vector3(p.getX(1), p.getY(1), p.getZ(1))]; };
    expect(seg(0).map((x) => x.toArray())).toEqual([[min[0], min[1] - O, min[2]], [max[0], min[1] - O, min[2]]]); // largeur devant, au sol
    expect(seg(1).map((x) => x.toArray())).toEqual([[max[0] + O, min[1], min[2]], [max[0] + O, max[1], min[2]]]); // profondeur à droite, au sol
    expect(seg(2).map((x) => x.toArray())).toEqual([[max[0] + O, max[1] + O, min[2]], [max[0] + O, max[1] + O, max[2]]]); // hauteur sur l'arête arrière droite, derrière
  });
  it("ignore les plaques sans groupe, les groupes d'un autre nom, les groupes sans nom et les groupes entièrement cachés", () => {
    const planks = [P({ id: 'solo' }), lame('x', 0, 'autre'), lame('y', 0, 'sansnom'), lame('h', 0, 'cache')];
    expect(habillageDimensions(sc(planks, { autre: 'Corps', cache: 'Habillage' }), new Set(['h']))).toEqual([]);
    expect(habillageDimensions(sc(planks, undefined), new Set())).toEqual([]);
  });
  it("un seul jeu de cotes par groupe (même avec plusieurs plaques), et les plaques cachées ne comptent pas dans l'encombrement", () => {
    const planks = [lame('a', 0, 'g'), lame('b', 100, 'g'), lame('c', 1000, 'g'), lame('d', 0, 'g2')];
    const out = habillageDimensions(sc(planks, { g: 'Habillage', g2: 'Habillage bis' }), new Set(['c']));
    expect(out).toHaveLength(6); // deux groupes × trois cotes
    const wide = extents([planks[0], planks[1]], 3)[0];
    expect(texts[0]).toBe(`${wide}`); // sans la plaque cachée à x = 1000
  });
});
