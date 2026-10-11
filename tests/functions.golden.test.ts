import { describe, it } from 'vitest';
import { Euler, MathUtils, Quaternion } from 'three';
import {
  bounds, corners, extents, holeOutline, makeBox, moveWithGroup, outline, pullFace, rotFromBasis, slotsForTeeth, toZUp, transformPlanks,
  type Plank, type PlankScene, type Vec3,
} from '@/birdhouse/model';
import { expectGolden, normalizeIds } from './helpers';

const box = makeBox(120, 100, 80, 3, 0, 1);
const scene: PlankScene = { t: 3, fit: 0, planks: box.planks, groupNames: { [box.group]: box.name }, up: 'z2' };
const tilted: Plank = { ...box.planks[0], id: 'tilt', group: undefined, pos: [10, 20, 30], rot: [33, -47, 112] };
const hole = { id: 'h', shape: 'square' as const, x: 5, y: -3, size: 20, sh: 12, r: 4 };

describe('fonctions pures du modèle (golden)', () => {
  it('outline / holeOutline', () => {
    expectGolden('fn-outline', {
      planks: box.planks.map((p) => outline(p)),
      round: holeOutline({ id: 'r', shape: 'round', x: 1, y: 2, size: 10 }),
      square: holeOutline({ ...hole, r: 0 }),
      rounded: holeOutline(hole),
    });
  });
  it('bounds / corners / extents', () => {
    expectGolden('fn-bounds', {
      boundsBox: bounds(scene.planks, 3), cornersBox: corners(scene.planks, 3), extentsBox: extents(scene.planks, 3),
      boundsTilt: bounds([tilted], 3), cornersTilt: corners([tilted], 3),
    });
  });
  it('rotFromBasis', () => {
    const cases: [Vec3, Vec3][] = [[[1, 0, 0], [0, 0, 1]], [[0, 1, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0]], [[0.6, 0.8, 0], [-0.8, 0.6, 0]], [[0, -1, 0], [1, 0, 0]], [[0, 0.7071067811865476, 0.7071067811865476], [1, 0, 0]]];
    expectGolden('fn-rotFromBasis', cases.map(([a, b]) => rotFromBasis(a, b)));
  });
  it('toZUp', () => {
    const base = [{ ...tilted, id: 'a' }, { ...box.planks[1], id: 'b', group: undefined, rot: [90, 0, 0] as Vec3, pos: [5, 6, 7] as Vec3 }];
    const out: Record<string, unknown> = {};
    for (const up of [undefined, 'z', 'z1', 'z2'] as const) out[String(up)] = normalizeIds(toZUp({ t: 3, fit: 0, planks: base, up }));
    expectGolden('fn-toZUp', out);
  });
  it('transformPlanks / moveWithGroup', () => {
    const ids = new Set(scene.planks.map((p) => p.id));
    const q = new Quaternion().setFromEuler(new Euler(MathUtils.degToRad(20), MathUtils.degToRad(35), MathUtils.degToRad(-70), 'XYZ'));
    const moved = moveWithGroup(scene, scene.planks[0].id, [13.37, -4.2, 55], [0, 0, 90]);
    expectGolden('fn-transform', { t: normalizeIds(transformPlanks(scene, ids, [5, 6, 7], q, [1, 2, 3])), m: normalizeIds(moved) });
  });
  it('pullFace', () => {
    const out: unknown[] = [];
    for (const [i, axis, sign, d] of [[0, 'z', 1, 10], [0, 'x', 1, 7], [2, 'y', -1, -5], [4, 'z', -1, 4]] as const) {
      const r = pullFace(scene, scene.planks[i].id, axis, sign, d);
      out.push({ applied: r.applied, scene: normalizeIds(r.scene) });
    }
    expectGolden('fn-pullFace', out);
  });
  it('slotsForTeeth', () => {
    const a = box.planks[0], other: Plank = { ...box.planks[4], id: 'x', group: undefined, name: 'autre', pos: [0, 0, 40], rot: [0, 0, 0] };
    const s: PlankScene = { t: 3, fit: 0, planks: [{ ...a, group: undefined, id: 'b', notches: [], holes: [] }, { ...other, w: 120, h: 100 }], up: 'z2' };
    const r = slotsForTeeth(s, 'b');
    expectGolden('fn-slots', { added: r.added, planks: r.planks, holes: r.scene.planks[0].holes.map((h) => ({ ...h, id: '-' })) });
  });
});
