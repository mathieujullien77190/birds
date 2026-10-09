import { BufferGeometry, Matrix4, Vector3 } from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import type { PartDef } from './presets/mallard';

/** Orientation du fichier : l'avant de l'oiseau pointe vers +X (à tourner d'un quart de tour) ou déjà vers +Y. */
export type StlOrientation = 'frontX' | 'frontY';
export const STL_ORIENTATION_LABELS: Record<StlOrientation, string> = {
  frontX: 'Z haut, avant +X',
  frontY: 'Z haut, avant +Y',
};
const TO_APP: Record<StlOrientation, Matrix4> = {
  frontX: new Matrix4().set(0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1), // (x, y, z) → (−y, x, z)
  frontY: new Matrix4(),
};

/** Longueur visée (un colvert fait ~1,8) et nombre de triangles visé après simplification. */
const TARGET_SIZE = 1.8;
const TARGET_TRIS = 3000;
const round = (v: number) => Math.round(v * 1e4) / 1e4;

/** Simplification par regroupement de sommets sur une grille : déterministe et rapide. Renvoie positions et indices. */
function cluster(src: Float32Array, min: Vector3, cell: number) {
  const cells = new Map<string, number>();
  const sum: number[] = [];
  const cnt: number[] = [];
  const ids = new Uint32Array(src.length / 3);
  for (let i = 0; i < ids.length; i++) {
    const x = src[i * 3], y = src[i * 3 + 1], z = src[i * 3 + 2];
    const key = `${Math.floor((x - min.x) / cell)},${Math.floor((y - min.y) / cell)},${Math.floor((z - min.z) / cell)}`;
    let id = cells.get(key);
    if (id === undefined) { id = cnt.length; cells.set(key, id); sum.push(0, 0, 0); cnt.push(0); }
    sum[id * 3] += x; sum[id * 3 + 1] += y; sum[id * 3 + 2] += z; cnt[id]++;
    ids[i] = id;
  }
  const idx: number[] = [];
  for (let t = 0; t < ids.length; t += 3) {
    const a = ids[t], b = ids[t + 1], c = ids[t + 2];
    if (a !== b && b !== c && a !== c) idx.push(a, b, c); // triangle écrasé : abandonné
  }
  const pos = cnt.flatMap((n, i) => [sum[i * 3] / n, sum[i * 3 + 1] / n, sum[i * 3 + 2] / n]);
  return { pos, idx };
}

/** Lit un .stl : une seule pièce « mesh », simplifiée (~3 000 triangles), centrée en X / Y, posée sur le sol, à l'échelle de l'app. */
export function importStl(buffer: ArrayBuffer, orientation: StlOrientation, name: string): PartDef[] {
  const geo: BufferGeometry = new STLLoader().parse(buffer).applyMatrix4(TO_APP[orientation]);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const size = bb.getSize(new Vector3());
  const s = TARGET_SIZE / Math.max(size.x, size.y, size.z, 1e-9);
  const src = geo.attributes.position.array as Float32Array;
  // recherche dichotomique de la taille de cellule : on garde le résultat le plus proche de la cible sans la dépasser
  const big = Math.max(size.x, size.y, size.z);
  let lo = big / 2000, hi = big / 4;
  let best = cluster(src, bb.min, hi);
  for (let k = 0; k < 16; k++) {
    const mid = (lo + hi) / 2;
    const r = cluster(src, bb.min, mid);
    if (r.idx.length / 3 > TARGET_TRIS) lo = mid;
    else { hi = mid; best = r; }
  }
  if (!best.idx.length) throw new Error('Maillage vide après simplification.');
  const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2;
  const origin = [cx, cy, bb.min.z];
  const pos = best.pos.map((v, i) => (v - origin[i % 3]) * s);
  // recentre la pièce sur son propre centre (pivot de rotation au milieu)
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  pos.forEach((v, i) => { mn[i % 3] = Math.min(mn[i % 3], v); mx[i % 3] = Math.max(mx[i % 3], v); });
  const c = mn.map((v, k) => (v + mx[k]) / 2);
  const local = pos.map((v, i) => round(v - c[i % 3]));
  geo.dispose();
  return [{
    shape: 'mesh', name: name.slice(0, 30), pos: [round(c[0]), round(c[1]), round(c[2])], rot: [0, 0, 0], scl: [1, 1, 1],
    yStretch: [1, 1], color: '#c9b8a0', detail: 1, smooth: false, mirror: false, transparent: false, showAxes: false, mesh: { pos: local, idx: best.idx },
  }];
}
