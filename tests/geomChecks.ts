import { CatmullRomCurve3, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { Plank } from '@/birdhouse/model';
import { ribbonGeometry } from '@/birdhouse/three/factories/wire';

/** Outils de contrôle géométrique du nichoir (boîtes orientées, fils, nappes) partagés par les tests et les scripts de mise au point. */

/** Épaisseur réelle (selon z local) d'une pièce : `depth` pour un pavé, sinon l'épaisseur du bois. */
export const thick = (p: Plank, t: number): number => p.depth ?? (p.special === 'pi' ? 17 : p.special === 'camera' ? 12 : p.special === 'ir' ? 4 : p.special === 'sensor' ? 3 : t);

export interface Obb { c: Vector3; ax: Vector3[]; h: [number, number, number] }
export function obb(p: Plank, t: number): Obb {
  const q = new Quaternion().setFromEuler(new Euler((p.rot[0] * Math.PI) / 180, (p.rot[1] * Math.PI) / 180, (p.rot[2] * Math.PI) / 180, 'XYZ'));
  const m = new Matrix4().makeRotationFromQuaternion(q);
  return { c: new Vector3(...p.pos), ax: [0, 1, 2].map((i) => new Vector3().setFromMatrixColumn(m, i)), h: [p.w / 2, p.h / 2, thick(p, t) / 2] };
}
/** Profondeur de pénétration minimale entre deux boîtes orientées (0 = elles ne se touchent pas), théorème des axes séparateurs. */
export function overlap(a: Obb, b: Obb): number {
  let min = 1e9;
  const axes = [...a.ax, ...b.ax];
  for (const u of a.ax) for (const v of b.ax) { const x = new Vector3().crossVectors(u, v); if (x.length() > 1e-6) axes.push(x.normalize()); }
  const T = b.c.clone().sub(a.c);
  for (const L of axes) {
    const ra = a.h.reduce((s, hh, i) => s + hh * Math.abs(a.ax[i].dot(L)), 0), rb = b.h.reduce((s, hh, i) => s + hh * Math.abs(b.ax[i].dot(L)), 0);
    const pen = ra + rb - Math.abs(T.dot(L));
    if (pen <= 0) return 0;
    min = Math.min(min, pen);
  }
  return min;
}
/** Boîte alignée sur les axes qui englobe une pièce (8 coins). */
export function aabb(p: Plank, t: number): { min: Vector3; max: Vector3 } {
  const b = obb(p, t), min = new Vector3(1e9, 1e9, 1e9), max = new Vector3(-1e9, -1e9, -1e9);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const v = b.c.clone().addScaledVector(b.ax[0], sx * b.h[0]).addScaledVector(b.ax[1], sy * b.h[1]).addScaledVector(b.ax[2], sz * b.h[2]);
    min.min(v); max.max(v);
  }
  return { min, max };
}
/** Écart entre deux boîtes alignées (0 si elles se touchent ou se recoupent), par axe puis distance. */
export function gap(a: { min: Vector3; max: Vector3 }, b: { min: Vector3; max: Vector3 }): number {
  const d = (lo1: number, hi1: number, lo2: number, hi2: number) => Math.max(0, lo2 - hi1, lo1 - hi2);
  return Math.hypot(d(a.min.x, a.max.x, b.min.x, b.max.x), d(a.min.y, a.max.y, b.min.y, b.max.y), d(a.min.z, a.max.z, b.min.z, b.max.z));
}

/** Arrondit les angles d'un chemin comme la 3D (mêmes arcs : rayon 10 mm ou 4 × le diamètre). */
export function roundPath(pts: Vector3[], r: number): Vector3[] {
  if (pts.length < 3) return pts;
  const out: Vector3[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const A = pts[i - 1], P = pts[i], B = pts[i + 1];
    const da = A.clone().sub(P), db = B.clone().sub(P), la = da.length(), lb = db.length();
    if (la < 1e-6 || lb < 1e-6) continue;
    const rr = Math.min(r, la / 2, lb / 2);
    const p0 = P.clone().addScaledVector(da, rr / la), p2 = P.clone().addScaledVector(db, rr / lb);
    for (let k = 0; k <= 6; k++) { const u = k / 6; out.push(p0.clone().multiplyScalar((1 - u) * (1 - u)).addScaledVector(P, 2 * (1 - u) * u).addScaledVector(p2, u * u)); }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
export interface PathItem { name: string; r: number; pts: Vector3[]; kind?: string; ends: Vector3[] }
/** Courbes réelles (échantillonnées) des fils (tube de rayon w/2) et des nappes (prises comme un tube de rayon 8 : prudent). */
export function pathItems(planks: Plank[]): PathItem[] {
  return planks.filter((p) => p.path && p.special !== 'solar' && !/^Câble 12 V/.test(p.name) && p.special !== 'conduit').map((p) => {
    const raw = p.path!.map((q) => new Vector3(...q));
    const curve = p.special === 'wire' ? new CatmullRomCurve3(roundPath(raw, Math.max(10, 4 * p.w)), false, 'centripetal') : new CatmullRomCurve3(raw, false, 'centripetal');
    const N = Math.max(200, raw.length * 60);
    return { name: p.name, r: p.special === 'cable' ? 8 : p.w / 2, pts: Array.from({ length: N + 1 }, (_, i) => curve.getPoint(i / N)), kind: p.special, ends: [raw[0], raw[raw.length - 1]] };
  });
}
/** Contacts entre chemins : distance minimale < somme des rayons (+ marge). Les bouts qui se rejoignent (même borne) sont signalés. */
export function pathContacts(items: PathItem[], margin = 0.3): { A: string; B: string; short: number; at: number[]; shared: boolean }[] {
  const res: { A: string; B: string; short: number; at: number[]; shared: boolean }[] = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const A = items[i], B = items[j];
    let best = 1e9, where: Vector3 | null = null;
    for (let a = 0; a < A.pts.length; a += 2) for (let b = 0; b < B.pts.length; b += 2) { const d = A.pts[a].distanceTo(B.pts[b]); if (d < best) { best = d; where = A.pts[a]; } }
    const lim = A.r + B.r;
    if (best < lim + margin && where) {
      const w = where;
      const shared = [...A.ends, ...B.ends].some((e) => e.distanceTo(w) < 12);
      res.push({ A: A.name, B: B.name, short: lim - best, at: w.toArray().map((v) => Math.round(v)), shared });
    }
  }
  return res.sort((a, b) => b.short - a.short);
}
/** Sommets réels d'une nappe (ruban de la 3D) : pour vérifier qu'elle ne traverse aucune pièce. */
export function ribbonPoints(p: Plank): Vector3[] {
  const g = ribbonGeometry(p).geo, a = g.getAttribute('position'), out: Vector3[] = [];
  for (let i = 0; i < a.count; i++) out.push(new Vector3(a.getX(i), a.getY(i), a.getZ(i)));
  return out;
}
/** Un point est-il dans une boîte orientée (avec une marge) ? */
export function inside(pt: Vector3, b: Obb, margin = 0): boolean {
  const d = pt.clone().sub(b.c);
  return b.ax.every((u, i) => Math.abs(d.dot(u)) <= b.h[i] + margin);
}
