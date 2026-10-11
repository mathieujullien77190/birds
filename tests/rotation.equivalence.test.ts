import { describe, expect, it } from 'vitest';
import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import { rotFromBasis, toZUp, transformPlanks, type Plank, type PlankScene, type Vec3 } from '@/birdhouse/model';
import { basisToEulerRad, fromAxisAngle, fromEulerDeg, invert, multiply, rotate, toEulerRad, type Rotation } from '@/birdhouse/model/math/rotation';

/** Preuve d'équivalence : le module de rotation maison donne les mêmes nombres que three.js (à 1e-9 près). */
const N = 2500, EPS = 1e-9;
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const rdeg = (): Vec3 => {
  const pick = () => (rnd() < 0.25 ? [0, 90, -90, 180, 45, 270][Math.floor(rnd() * 6)] : Math.round((rnd() - 0.5) * 720));
  return [pick(), pick(), pick()];
};
const rvec = (): Vec3 => [(rnd() - 0.5) * 400, (rnd() - 0.5) * 400, (rnd() - 0.5) * 400];
const tq = (r: Vec3) => new Quaternion().setFromEuler(new Euler(MathUtils.degToRad(r[0]), MathUtils.degToRad(r[1]), MathUtils.degToRad(r[2]), 'XYZ'));
const close = (a: ArrayLike<number>, b: ArrayLike<number>) => { for (let i = 0; i < a.length; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(EPS); };
const qArr = (q: Rotation | Quaternion): number[] => [q.x, q.y, q.z, q.w];
const roundE = (e: Euler) => [e.x, e.y, e.z].map((r) => Math.round(MathUtils.radToDeg(r)));

describe('rotation maison = three.js', () => {
  it('Euler XYZ → quaternion, composition, inverse, application', () => {
    for (let i = 0; i < N; i++) {
      const a = rdeg(), b = rdeg(), v = rvec();
      close(qArr(fromEulerDeg(a)), qArr(tq(a)));
      close(qArr(multiply(fromEulerDeg(a), fromEulerDeg(b))), qArr(tq(a).multiply(tq(b))));
      close(qArr(invert(fromEulerDeg(a))), qArr(tq(a).invert()));
      close(rotate(v, fromEulerDeg(a)), new Vector3(...v).applyQuaternion(tq(a)).toArray());
    }
  });
  it('quaternion → Euler XYZ (y.c. blocage de cardan)', () => {
    for (let i = 0; i < N; i++) {
      const a = rdeg(), b = rdeg();
      const q = multiply(fromEulerDeg(a), fromEulerDeg(b)), tqq = tq(a).multiply(tq(b));
      close(toEulerRad(q), new Euler().setFromQuaternion(tqq, 'XYZ').toArray().slice(0, 3) as number[]);
    }
    for (const y of [90, -90, 89.99999, 270]) close(toEulerRad(fromEulerDeg([30, y, 40])), new Euler().setFromQuaternion(tq([30, y, 40]), 'XYZ').toArray().slice(0, 3) as number[]);
  });
  it('axe-angle', () => {
    for (let i = 0; i < 200; i++) {
      const ang = (rnd() - 0.5) * 7, ax: Vec3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]][i % 3] as Vec3;
      close(qArr(fromAxisAngle(ax, ang)), qArr(new Quaternion().setFromAxisAngle(new Vector3(...ax), ang)));
    }
  });
  it('rotFromBasis', () => {
    for (let i = 0; i < N; i++) {
      const q = tq(rdeg()), x = new Vector3(1, 0, 0).applyQuaternion(q), y = new Vector3(0, 1, 0).applyQuaternion(q), z = x.clone().cross(y);
      const ref = roundE(new Euler().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z), 'XYZ'));
      expect(rotFromBasis(x.toArray() as Vec3, y.toArray() as Vec3)).toEqual(ref);
      close(basisToEulerRad(x.toArray() as Vec3, y.toArray() as Vec3, z.toArray() as Vec3), new Euler().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z), 'XYZ').toArray().slice(0, 3) as number[]);
    }
  });
  const mkPlank = (rot: Vec3, pos: Vec3, id: string): Plank => ({ id, name: id, w: 10, h: 10, pos, rot, notches: [], holes: [] });
  it('toZUp', () => {
    const qM = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2), qMi = qM.clone().invert();
    for (let i = 0; i < N; i++) {
      const up = [undefined, 'z', 'z1'][i % 3] as PlankScene['up'], rot = rdeg(), pos = rvec();
      const out = toZUp({ t: 3, fit: 0, planks: [mkPlank(rot, pos, 'a')], up }).planks[0];
      const qc = tq(rot);
      const q = up === 'z' ? qc.clone().multiply(qM) : up === 'z1' ? qMi.clone().multiply(qc).multiply(qM) : qM.clone().multiply(qc);
      expect(out.rot).toEqual(roundE(new Euler().setFromQuaternion(q, 'XYZ')));
      expect(out.pos).toEqual(up ? pos : [pos[0], -pos[2], pos[1]]);
    }
  });
  it('transformPlanks', () => {
    for (let i = 0; i < N; i++) {
      const rot = rdeg(), pos = rvec(), shift = rvec(), pivot = rvec(), d = rdeg();
      const out = transformPlanks({ t: 3, fit: 0, planks: [mkPlank(rot, pos, 'a')] }, new Set(['a']), shift, fromEulerDeg(d), pivot).planks[0];
      const qD = tq(d), r2 = (x: number) => Math.round(x * 100) / 100;
      const np = new Vector3(...pos).sub(new Vector3(...pivot)).applyQuaternion(qD).add(new Vector3(...pivot)).add(new Vector3(...shift));
      expect(out.pos).toEqual([r2(np.x), r2(np.y), r2(np.z)]);
      expect(out.rot).toEqual(roundE(new Euler().setFromQuaternion(qD.clone().multiply(tq(rot)), 'XYZ')));
    }
  });
});
