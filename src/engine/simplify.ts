import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';

/**
 * Réduction du nombre de triangles par regroupement de sommets sur une grille (vertex clustering).
 * Rapide (quelques dizaines de ms pour 100 000 triangles), déterministe, et fusionne au passage les sommets
 * dupliqués d'un STL. Rendu « low poly » assumé : pas de préservation fine des arêtes.
 */

interface Clustered { pos: Float32Array; idx: Uint32Array }

/** Regroupe les sommets par cellule de taille `cell` ; chaque cellule devient un sommet (moyenne), les triangles écrasés disparaissent. */
function cluster(src: ArrayLike<number>, min: Vector3, size: Vector3, cell: number): Clustered {
  const nx = Math.floor(size.x / cell) + 1, ny = Math.floor(size.y / cell) + 1;
  const ids = new Map<number, number>();
  const sum: number[] = [];
  const cnt: number[] = [];
  const vertCount = src.length / 3;
  const vid = new Uint32Array(vertCount);
  for (let i = 0; i < vertCount; i++) {
    const x = src[i * 3], y = src[i * 3 + 1], z = src[i * 3 + 2];
    const key = Math.floor((x - min.x) / cell) + nx * (Math.floor((y - min.y) / cell) + ny * Math.floor((z - min.z) / cell));
    let id = ids.get(key);
    if (id === undefined) { id = cnt.length; ids.set(key, id); sum.push(0, 0, 0); cnt.push(0); }
    sum[id * 3] += x; sum[id * 3 + 1] += y; sum[id * 3 + 2] += z; cnt[id]++;
    vid[i] = id;
  }
  const idx: number[] = [];
  for (let t = 0; t < vertCount; t += 3) {
    const a = vid[t], b = vid[t + 1], c = vid[t + 2];
    if (a !== b && b !== c && a !== c) idx.push(a, b, c);
  }
  const pos = new Float32Array(cnt.length * 3);
  for (let i = 0; i < cnt.length; i++) {
    pos[i * 3] = sum[i * 3] / cnt[i]; pos[i * 3 + 1] = sum[i * 3 + 1] / cnt[i]; pos[i * 3 + 2] = sum[i * 3 + 2] / cnt[i];
  }
  return { pos, idx: Uint32Array.from(idx) };
}

/**
 * Renvoie une géométrie non indexée d'environ `target` triangles (jamais plus), à partir d'une géométrie non indexée.
 * Recherche dichotomique de la taille de cellule.
 */
export function simplify(original: BufferGeometry, target: number): BufferGeometry {
  const src = original.attributes.position.array;
  if (!original.boundingBox) original.computeBoundingBox();
  const bb = original.boundingBox!;
  const size = bb.getSize(new Vector3());
  const big = Math.max(size.x, size.y, size.z);
  let lo = big / 4000, hi = big / 3;
  let best = cluster(src, bb.min, size, hi);
  for (let k = 0; k < 18; k++) {
    const mid = (lo + hi) / 2;
    const r = cluster(src, bb.min, size, mid);
    if (r.idx.length / 3 > target) lo = mid;
    else { hi = mid; best = r; }
    if (Math.abs(r.idx.length / 3 - target) < target * 0.02 && r.idx.length / 3 <= target) break;
  }
  // on repasse en non indexé : normales plates par face, comme l'original
  const out = new Float32Array(best.idx.length * 3);
  for (let i = 0; i < best.idx.length; i++) {
    const v = best.idx[i] * 3;
    out[i * 3] = best.pos[v]; out[i * 3 + 1] = best.pos[v + 1]; out[i * 3 + 2] = best.pos[v + 2];
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(out, 3));
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
