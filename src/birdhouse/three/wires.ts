import { BufferGeometry, CatmullRomCurve3, Color, Float32BufferAttribute, Quaternion, TubeGeometry, Vector3 } from 'three';
import type { Plank } from '../model';
import { PALETTE } from './registry/palette';

/** Fil électrique : tube lissé le long de p.path, diamètre p.w, couleur p.color. */
/** Gaine annelée (ICTA) : un tube dont le rayon ondule le long de la courbe (anneaux tous les 3 mm, ± 8 %), noir. */
export function conduitGeometry(p: Plank): { geo: BufferGeometry; edges: BufferGeometry } {
  const curve = new CatmullRomCurve3((p.path ?? []).map((q) => new Vector3(...q)), false, 'catmullrom', 0.5);
  const len = curve.getLength(), pitch = 3, tub = Math.max(8, Math.round((len / pitch) * 6)), rad = 14;
  const geo = new TubeGeometry(curve, tub, p.w / 2, rad, false);
  const pos = geo.attributes.position, nrm = geo.attributes.normal;
  for (let i = 0; i < pos.count; i++) { // la grille du tube est (tub + 1) rangées de (rad + 1) sommets : la rangée donne l'abscisse le long de la gaine
    const j = Math.floor(i / (rad + 1)), s = (j / tub) * len, k = 1 + 0.08 * Math.sin((2 * Math.PI * s) / pitch);
    const r = p.w / 2;
    pos.setXYZ(i, pos.getX(i) + nrm.getX(i) * r * (k - 1), pos.getY(i) + nrm.getY(i) * r * (k - 1), pos.getZ(i) + nrm.getZ(i) * r * (k - 1));
  }
  geo.computeVertexNormals();
  const c = new Color(p.color ?? PALETTE.conduit), n = pos.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b; }
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  return { geo, edges: new BufferGeometry().setAttribute('position', new Float32BufferAttribute([], 3)) };
}

/** Arrondit les angles d'un chemin : à chaque sommet intermédiaire, le coude est remplacé par un arc (Bézier quadratique) de rayon r — un vrai fil ne fait pas d'angle vif,
 *  il tourne en courbe. r est limité à la moitié des deux segments voisins pour que les arcs ne se chevauchent pas. */
function roundPath(pts: Vector3[], r: number): Vector3[] {
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
export function wireGeometry(p: Plank): { geo: BufferGeometry; edges: BufferGeometry } {
  const raw = (p.path ?? []).map((q) => new Vector3(...q));
  const curve = new CatmullRomCurve3(roundPath(raw, Math.max(10, 4 * p.w)), false, 'centripetal'); // coudes arrondis (rayon 10 mm, plus pour les gros fils), puis lissage sans dépassement
  const geo = new TubeGeometry(curve, Math.max(64, raw.length * 24), p.w / 2, 8, false);
  const c = new Color(p.color ?? PALETTE.slate), n = geo.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b; }
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  return { geo, edges: new BufferGeometry().setAttribute('position', new Float32BufferAttribute([], 3)) };
}

/** Nappe plate (câble CSI) : ruban lissé le long de p.path, largeur p.w, repère transporté sans torsion. */
export function ribbonGeometry(p: Plank): { geo: BufferGeometry; edges: BufferGeometry } {
  const curve = new CatmullRomCurve3((p.path ?? []).map((q) => new Vector3(...q)), false, 'centripetal'); // centripète : pas de boucle ni de dépassement entre les points
  const N = 120, pts = curve.getPoints(N), pos: number[] = [], idx: number[] = [], col: number[] = [];
  const c = new Color(PALETTE.ribbon), tip = new Color(PALETTE.ribbonTip); // ruban orange, embouts bleus (renforts des connecteurs)
  // repère transporté sans torsion, puis torsion répartie sur la fin pour que la largeur de la nappe tombe dans l'axe du connecteur d'arrivée :
  // la nappe arrive à l'horizontale, sa largeur horizontale et perpendiculaire à sa direction
  const tans: Vector3[] = [], sides: Vector3[] = [];
  let side = new Vector3(1, 0, 0), prev = curve.getTangent(0);
  for (let i = 0; i <= N; i++) {
    const tg = curve.getTangent(i / N);
    if (i > 0) side = side.clone().applyQuaternion(new Quaternion().setFromUnitVectors(prev, tg));
    prev = tg; tans.push(tg); sides.push(side.clone());
  }
  const tEnd = tans[N], sEnd = sides[N];
  let want = new Vector3().crossVectors(tEnd, new Vector3(0, 0, 1)); // largeur horizontale à l'arrivée
  if (want.lengthSq() > 1e-6) {
    want.normalize();
    if (sEnd.dot(want) < 0) want = want.negate();
    const phi = Math.atan2(new Vector3().crossVectors(sEnd, want).dot(tEnd), sEnd.dot(want)); // torsion à répartir
    for (let i = 0; i <= N; i++) { const u = Math.min(1, Math.max(0, (i / N - 0.5) / 0.5)), k = u * u * (3 - 2 * u); sides[i].applyAxisAngle(tans[i], phi * k); }
  }
  for (let i = 0; i <= N; i++) {
    const a = pts[i].clone().addScaledVector(sides[i], -p.w / 2), b = pts[i].clone().addScaledVector(sides[i], p.w / 2);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z); const cc = i / N < 0.04 || i / N > 0.96 ? tip : c; col.push(cc.r, cc.g, cc.b, cc.r, cc.g, cc.b);
    if (i > 0) { const k = 2 * (i - 1); idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return { geo, edges: new BufferGeometry().setAttribute('position', new Float32BufferAttribute([], 3)) };
}
