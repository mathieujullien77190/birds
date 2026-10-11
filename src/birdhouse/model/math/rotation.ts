/**
 * Rotations minimales, SANS three.js : vecteurs en tuples, quaternions `{ x, y, z, w }`, angles d'Euler 'XYZ' en degrés.
 * Les formules sont celles de three.js (Euler 'XYZ' = R = Rx · Ry · Rz) et gardent le même ordre d'opérations,
 * pour que le modèle reste pur tout en donnant les mêmes nombres (voir tests/rotation.equivalence.test.ts).
 */
export type V3 = [number, number, number];
/** Une rotation (quaternion unitaire). */
export interface Rotation { x: number; y: number; z: number; w: number }

const DEG2RAD = Math.PI / 180, RAD2DEG = 180 / Math.PI; // mêmes constantes que MathUtils de three
export const degToRad = (d: number): number => d * DEG2RAD;
export const radToDeg = (r: number): number => r * RAD2DEG;

// ----- vecteurs -----
export const vadd = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vsub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vscale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const vaddScaled = (a: V3, b: V3, s: number): V3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export const vdot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vcross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// ----- quaternions -----
/** Rotation d'angles d'Euler 'XYZ' (radians). */
export function fromEulerRad(x: number, y: number, z: number): Rotation {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return {
    x: s1 * c2 * c3 + c1 * s2 * s3,
    y: c1 * s2 * c3 - s1 * c2 * s3,
    z: c1 * c2 * s3 + s1 * s2 * c3,
    w: c1 * c2 * c3 - s1 * s2 * s3,
  };
}
/** Rotation d'une plaque : angles d'Euler 'XYZ' en degrés. */
export const fromEulerDeg = (rot: V3): Rotation => fromEulerRad(degToRad(rot[0]), degToRad(rot[1]), degToRad(rot[2]));
/** Rotation d'un angle (radians) autour d'un axe unitaire. */
export function fromAxisAngle(axis: V3, angle: number): Rotation {
  const half = angle / 2, s = Math.sin(half);
  return { x: axis[0] * s, y: axis[1] * s, z: axis[2] * s, w: Math.cos(half) };
}
/** Composition a · b (b d'abord, puis a). */
export function multiply(a: Rotation, b: Rotation): Rotation {
  return {
    x: a.x * b.w + a.w * b.x + a.y * b.z - a.z * b.y,
    y: a.y * b.w + a.w * b.y + a.z * b.x - a.x * b.z,
    z: a.z * b.w + a.w * b.z + a.x * b.y - a.y * b.x,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}
/** Rotation inverse (conjuguée : la rotation est unitaire). */
export const invert = (q: Rotation): Rotation => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
/** Applique la rotation à un vecteur. */
export function rotate(v: V3, q: Rotation): V3 {
  const [vx, vy, vz] = v;
  const tx = 2 * (q.y * vz - q.z * vy), ty = 2 * (q.z * vx - q.x * vz), tz = 2 * (q.x * vy - q.y * vx); // t = 2 · (q.xyz × v)
  return [vx + q.w * tx + q.y * tz - q.z * ty, vy + q.w * ty + q.z * tx - q.x * tz, vz + q.w * tz + q.x * ty - q.y * tx]; // v + q.w · t + q.xyz × t
}

// ----- retour vers les angles d'Euler 'XYZ' -----
/** Angles d'Euler 'XYZ' (radians) d'une matrice dont on donne les éléments m11, m12, m13, m22, m23, m32, m33. */
function eulerFromMatrix(m11: number, m12: number, m13: number, m22: number, m23: number, m32: number, m33: number): V3 {
  const y = Math.asin(Math.min(1, Math.max(-1, m13)));
  if (Math.abs(m13) < 0.9999999) return [Math.atan2(-m23, m33), y, Math.atan2(-m12, m11)];
  return [Math.atan2(m32, m22), y, 0];
}
/** Angles d'Euler 'XYZ' (radians) d'une rotation. */
export function toEulerRad(q: Rotation): V3 {
  const x2 = q.x + q.x, y2 = q.y + q.y, z2 = q.z + q.z;
  const xx = q.x * x2, xy = q.x * y2, xz = q.x * z2, yy = q.y * y2, yz = q.y * z2, zz = q.z * z2, wx = q.w * x2, wy = q.w * y2, wz = q.w * z2;
  return eulerFromMatrix(1 - (yy + zz), xy - wz, xz + wy, 1 - (xx + zz), yz - wx, yz + wx, 1 - (xx + yy));
}
/** Angles d'Euler 'XYZ' d'une base (colonnes x, y, z de la matrice de rotation), en radians. */
export const basisToEulerRad = (x: V3, y: V3, z: V3): V3 => eulerFromMatrix(x[0], y[0], z[0], y[1], z[1], y[2], z[2]);
/** Radians → degrés entiers (les rotations des plaques sont des degrés entiers). */
export const roundDeg = (e: V3): V3 => [Math.round(radToDeg(e[0])), Math.round(radToDeg(e[1])), Math.round(radToDeg(e[2]))];
