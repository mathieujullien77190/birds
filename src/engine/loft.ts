import { BufferGeometry, Float32BufferAttribute, Vector2, Vector3 } from 'three';
import { planeBasis, sectionContours, type SlicePlane } from './slices';

/**
 * Reconstruit un modèle 3D fermé à partir de coupes parallèles (le « fil de fer ») : le contour principal de chaque coupe est
 * ré-échantillonné en N points régulièrement espacés, tous partis de la même direction, puis les anneaux successifs sont reliés
 * par des quadrilatères (loft) et les deux bouts fermés par un éventail. Seule la boucle extérieure la plus grande de chaque coupe
 * est gardée : les parties séparées (pattes, branche) disparaissent, et une section très concave peut se tordre.
 */

const area2 = (poly: Vector2[]) => { let a = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p.x * q.y - q.x * p.y; } return a / 2; };

/** N points régulièrement espacés (abscisse curviligne) sur un contour fermé. */
function resample(poly: Vector2[], n: number): Vector2[] {
  const len: number[] = [0];
  for (let i = 0; i < poly.length; i++) len.push(len[i] + poly[i].distanceTo(poly[(i + 1) % poly.length]));
  const total = len[len.length - 1];
  const out: Vector2[] = [];
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const t = (k / n) * total;
    while (seg < poly.length - 1 && len[seg + 1] < t) seg++;
    const f = (t - len[seg]) / Math.max(len[seg + 1] - len[seg], 1e-12);
    out.push(poly[seg].clone().lerp(poly[(seg + 1) % poly.length], Math.min(1, Math.max(0, f))));
  }
  return out;
}

export interface LoftResult { geo: BufferGeometry; rings: number; dropped: number }

/** Loft des coupes de `planes` (parallèles, même normale), sur le maillage non indexé `pos`. null s'il y a moins de deux coupes utilisables. */
export function loftFromPlanes(pos: ArrayLike<number>, planes: SlicePlane[], samples = 64): LoftResult | null {
  if (planes.length < 2) return null;
  const n = planes[0].normal.clone().normalize();
  const { u, v } = planeBasis(n);
  const ordered = [...planes].sort((a, b) => a.normal.dot(a.point) - b.normal.dot(b.point));
  const rings: Vector3[][] = [];
  const centers: Vector3[] = [];
  let dropped = 0;
  for (const pl of ordered) {
    const { polys } = sectionContours(pos, n, n.dot(pl.point));
    if (!polys.length) { dropped++; continue; }
    // boucle la plus grande, dans le repère (u, v) du plan, sens direct
    const loops = polys.map((p) => p.slice(0, -1).map((q) => new Vector2(q.dot(u), q.dot(v)))).filter((l) => l.length >= 3);
    if (!loops.length) { dropped++; continue; }
    let best = loops[0];
    for (const l of loops) if (Math.abs(area2(l)) > Math.abs(area2(best))) best = l;
    if (area2(best) < 0) best = [...best].reverse();
    const pts = resample(best, samples);
    // départ commun : le point le plus proche de la direction +u depuis le centre
    const c = pts.reduce((m, p) => m.add(p), new Vector2()).divideScalar(pts.length);
    let s = 0, bs = -Infinity;
    pts.forEach((p, i) => { const d = p.clone().sub(c); const sc = d.x / Math.max(d.length(), 1e-12); if (sc > bs) { bs = sc; s = i; } });
    const shift = [...pts.slice(s), ...pts.slice(0, s)];
    const d0 = n.dot(pl.point);
    rings.push(shift.map((p) => u.clone().multiplyScalar(p.x).addScaledVector(v, p.y).addScaledVector(n, d0)));
    centers.push(u.clone().multiplyScalar(c.x).addScaledVector(v, c.y).addScaledVector(n, d0));
  }
  if (rings.length < 2) return null;
  const tris: number[] = [];
  const push = (a: Vector3, b: Vector3, c: Vector3) => tris.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let k = 0; k + 1 < rings.length; k++) {
    const A = rings[k], B = rings[k + 1];
    for (let i = 0; i < samples; i++) {
      const j = (i + 1) % samples;
      push(A[i], A[j], B[j]);
      push(A[i], B[j], B[i]);
    }
  }
  // fermeture des deux bouts : éventail vers le centre de la première / dernière coupe
  for (let i = 0; i < samples; i++) {
    const j = (i + 1) % samples;
    push(centers[0], rings[0][j], rings[0][i]);
    const L = rings.length - 1;
    push(centers[L], rings[L][i], rings[L][j]);
  }
  // orientation : volume signé positif = faces tournées vers l'extérieur ; sinon on retourne tout
  let vol = 0;
  for (let t = 0; t < tris.length; t += 9) {
    const ax = tris[t], ay = tris[t + 1], az = tris[t + 2], bx = tris[t + 3], by = tris[t + 4], bz = tris[t + 5], cx = tris[t + 6], cy = tris[t + 7], cz = tris[t + 8];
    vol += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  if (vol < 0) for (let t = 0; t < tris.length; t += 9) for (let k = 0; k < 3; k++) { const tmp = tris[t + 3 + k]; tris[t + 3 + k] = tris[t + 6 + k]; tris[t + 6 + k] = tmp; }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(tris, 3));
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return { geo, rings: rings.length, dropped };
}
