import { type Vec3, type Plank, type PlankScene } from '../types';
import { r2 } from '../util';
import { fromAxisAngle, fromEulerDeg, invert, multiply, rotate, roundDeg, toEulerRad, basisToEulerRad, vadd, vcross, vsub, type Rotation } from '../math/rotation';

/** Rotation (degrés XYZ) qui envoie l'axe x local sur `bx` et l'axe y local sur `by` (base directe : z = x × y). */
export function rotFromBasis(bx: Vec3, by: Vec3): Vec3 {
  return roundDeg(basisToEulerRad(bx, by, vcross(bx, by)));
}

/** Conversion d'une scène Y = hauteur (ancien repère) vers Z = hauteur : (x, y, z) → (x, −z, y), rotations composées avec Rx(+90°) (le monde entier tourne). */
export function toZUp(s: PlankScene): PlankScene {
  if (s.up === 'z2') return s;
  const qM = fromAxisAngle([1, 0, 0], Math.PI / 2), qMi = invert(qM);
  return {
    ...s,
    up: 'z2',
    planks: s.planks.map((p) => {
      const qc = fromEulerDeg(p.rot);
      // bonne formule : R = Rx(90) · R_ancien. 'z' avait fait R_conj = Rx(90)·R·Rx(−90) → R = R_conj·Rx(90) ; 'z1' avait fait Rx(90)·R_conj → R = Rx(−90)·R_z1·Rx(90)
      const q = s.up === 'z' ? multiply(qc, qM) : s.up === 'z1' ? multiply(multiply(qMi, qc), qM) : multiply(qM, qc);
      const e = toEulerRad(q);
      return { ...p, pos: s.up ? p.pos : ([p.pos[0], -p.pos[2], p.pos[1]] as Vec3), rot: roundDeg(e) };
    }),
  };
}

/** Boîte englobante (monde) d'un ensemble de plaques, rotations comprises. */
export function bounds(planks: Plank[], t: number): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of planks) {
    const [a, b, c] = p.rot.map((d) => (d * Math.PI) / 180);
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
    // matrice de rotation XYZ (ordre de Three.js : R = Rx · Ry · Rz)
    const R = [
      [cb * cc, -cb * sc, sb],
      [ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb],
      [sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb],
    ];
    for (const x of [-p.w / 2, p.w / 2]) for (const y of [-p.h / 2, p.h / 2]) for (const z of [-(p.depth ?? t) / 2, (p.depth ?? t) / 2]) {
      for (let i = 0; i < 3; i++) { const v = R[i][0] * x + R[i][1] * y + R[i][2] * z + p.pos[i]; if (v < min[i]) min[i] = v; if (v > max[i]) max[i] = v; }
    }
  }
  return { min, max };
}

/** Les 8 coins (monde) d'un composant : une plaque seule → les coins de sa dalle w × h × t tournée ; plusieurs → les coins de la boîte englobante. */
export function corners(planks: Plank[], t: number): Vec3[] {
  if (planks.length === 1) {
    const p = planks[0];
    const q = fromEulerDeg(p.rot);
    const out: Vec3[] = [];
    for (const x of [-p.w / 2, p.w / 2]) for (const y of [-p.h / 2, p.h / 2]) for (const z of [-(p.depth ?? t) / 2, (p.depth ?? t) / 2]) {
      out.push(vadd(rotate([x, y, z], q), p.pos));
    }
    return out;
  }
  const { min, max } = bounds(planks, t);
  const out: Vec3[] = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) out.push([x, y, z]);
  return out;
}

/** Les plaques du composant de plus haut niveau qui contient `id` : son groupe, ou elle seule. */
export function componentOf(s: PlankScene, id: string): Plank[] {
  const p = s.planks.find((x) => x.id === id);
  if (!p) return [];
  return p.group ? s.planks.filter((x) => x.group === p.group) : [p];
}

/** Encombrement d'un ensemble de plaques : [largeur x, profondeur y, hauteur z] en mm, arrondis. */
export function extents(planks: Plank[], t: number): [number, number, number] {
  if (!planks.length) return [0, 0, 0];
  const { min, max } = bounds(planks, t);
  return [Math.round(max[0] - min[0]), Math.round(max[1] - min[1]), Math.round(max[2] - min[2])];
}

/** Les plaques qui bougent avec `p` : celles de son groupe, et elles seules (pas de règle de contenu : l'utilisateur lie explicitement). */
export function movingWith(s: PlankScene, p: Plank): Plank[] {
  return p.group ? s.planks.filter((x) => x.group === p.group && x.id !== p.id) : [];
}

/** Applique à des plaques une rotation `qD` autour de `pivot` puis une translation `shift` (positions au centième, rotations en degrés entiers). */
export function transformPlanks(s: PlankScene, ids: Set<string>, shift: Vec3, qD: Rotation, pivot: Vec3): PlankScene {
  const centre = pivot, sh = shift;
  return {
    ...s,
    planks: s.planks.map((x) => {
      if (!ids.has(x.id)) return x;
      const np = vadd(vadd(rotate(vsub(x.pos, centre), qD), centre), sh);
      const e = toEulerRad(multiply(qD, fromEulerDeg(x.rot)));
      return { ...x, pos: [r2(np[0]), r2(np[1]), r2(np[2])] as Vec3, rot: roundDeg(e) };
    }),
  };
}

/**
 * Nouvelle position / rotation d'une plaque, répercutée sur ce qui bouge avec elle (`movingWith`) : même translation,
 * et même rotation autour du centre de la plaque déplacée (les autres tournent avec elle, comme un bloc).
 */
export function moveWithGroup(s: PlankScene, id: string, pos: Vec3, rot: Vec3): PlankScene {
  const p = s.planks.find((x) => x.id === id);
  if (!p) return s;
  const members = movingWith(s, p);
  const qOld = fromEulerDeg(p.rot), qNew = fromEulerDeg(rot);
  const qD = multiply(qNew, invert(qOld));
  const shift: Vec3 = [pos[0] - p.pos[0], pos[1] - p.pos[1], pos[2] - p.pos[2]];
  const next = transformPlanks(s, new Set(members.map((x) => x.id)), shift, qD, p.pos);
  return { ...next, planks: next.planks.map((x) => (x.id === id ? { ...x, pos, rot } : x)) }; // la plaque menée prend exactement ce qu'on lui a donné
}
