import { BufferGeometry, Vector2, Vector3 } from 'three';

/**
 * Dépliage d'un maillage triangulé en pièces à plat (patron papier en polygones, pas cintré).
 * On part du plus grand triangle ; chaque triangle voisin est posé dans le plan à côté de son parent, par l'arête commune, en
 * choisissant à chaque tour celui qui agrandit le moins la pièce (pièces compactes). S'il chevauche la pièce en cours ou la
 * ferait déborder de la page, il attend et finira dans une autre pièce. Les arêtes ouvertes (coupées) reçoivent un numéro commun à
 * leurs deux côtés, avec une languette d'un seul côté ; les arêtes pliées sont marquées montagne ou vallée.
 */

export type FoldKind = 'mountain' | 'valley' | 'flat';

export interface Placed {
  tri: number;
  /** Sommets 2D, dans l'ordre des sommets du triangle (sens direct : l'intérieur est à gauche de chaque arête). */
  q: [Vector2, Vector2, Vector2];
}
export interface Fold { a: Vector2; b: Vector2; kind: FoldKind }
export interface CutEdge {
  /** De a vers b dans le sens direct du triangle : la pièce est à gauche, la languette ira à droite. */
  a: Vector2;
  b: Vector2;
  /** Numéro partagé avec l'autre côté de l'arête (0 = bord réel du modèle, rien à coller). */
  label: number;
  /** Ce côté porte la languette (l'autre côté du même numéro n'en a pas). */
  tab: boolean;
}
export interface Island { tris: Placed[]; folds: Fold[]; cuts: CutEdge[] }
export interface Unfolded {
  islands: Island[];
  /** Pièce de chaque triangle du maillage (−1 : triangle dégénéré ignoré). */
  islandOfTri: Int32Array;
  labels: number;
}

export interface UnfoldOptions {
  /** Triangles au plus par pièce (une pièce tentaculaire est pénible à coller). */
  maxTris?: number;
  /** Encombrement maximal d'une pièce, en unités du modèle : [grand côté, petit côté] (la page, en pratique). */
  maxExtent?: [number, number];
}

interface Tri { v: [number, number, number]; n: Vector3; area: number }

const EPS_REL = 1e-4;

/** Soude les sommets confondus et renvoie les triangles avec leur normale. */
function weld(geo: BufferGeometry): { pts: Vector3[]; tris: Tri[] } {
  const p = geo.attributes.position.array;
  const pts: Vector3[] = [];
  const ids = new Map<string, number>();
  const idOf = (x: number, y: number, z: number) => {
    const k = `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
    let id = ids.get(k);
    if (id === undefined) { id = pts.length; ids.set(k, id); pts.push(new Vector3(x, y, z)); }
    return id;
  };
  const tris: Tri[] = [];
  const ab = new Vector3(), ac = new Vector3();
  for (let t = 0; t < p.length; t += 9) {
    const v: [number, number, number] = [idOf(p[t], p[t + 1], p[t + 2]), idOf(p[t + 3], p[t + 4], p[t + 5]), idOf(p[t + 6], p[t + 7], p[t + 8])];
    ab.subVectors(pts[v[1]], pts[v[0]]); ac.subVectors(pts[v[2]], pts[v[0]]);
    const n = new Vector3().crossVectors(ab, ac);
    const area = n.length() / 2;
    n.normalize();
    tris.push({ v, n, area });
  }
  return { pts, tris };
}

const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
const side = (a: Vector2, b: Vector2, p: Vector2) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);

/** Deux polygones convexes se chevauchent-ils (contact sur un bord ou un coin toléré) ? Séparation par les axes. */
export function polysOverlap(A: Vector2[], B: Vector2[], eps: number): boolean {
  for (const P of [A, B]) {
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      const nx = -(b.y - a.y), ny = b.x - a.x; // normale de l'arête
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const q of A) { const d = q.x * nx + q.y * ny; if (d < minA) minA = d; if (d > maxA) maxA = d; }
      for (const q of B) { const d = q.x * nx + q.y * ny; if (d < minB) minB = d; if (d > maxB) maxB = d; }
      const len = Math.hypot(nx, ny) || 1;
      if (maxA <= minB + eps * len || maxB <= minA + eps * len) return false;
    }
  }
  return true;
}

/** Déplie la géométrie (non indexée). */
export function unfold(geo: BufferGeometry, opts: UnfoldOptions = {}): Unfolded {
  const maxTris = opts.maxTris ?? Infinity;
  const [maxLong, maxShort] = opts.maxExtent ?? [Infinity, Infinity];
  const { pts, tris } = weld(geo);
  geo.computeBoundingBox();
  const bbSize = geo.boundingBox!.getSize(new Vector3());
  const eps = Math.max(bbSize.x, bbSize.y, bbSize.z) * EPS_REL;

  // arêtes → triangles qui les bordent
  const edges = new Map<string, { tri: number; k: number }[]>();
  tris.forEach((t, i) => {
    if (t.area < eps * eps) return;
    for (let k = 0; k < 3; k++) {
      const key = edgeKey(t.v[k], t.v[(k + 1) % 3]);
      const list = edges.get(key) ?? [];
      list.push({ tri: i, k });
      edges.set(key, list);
    }
  });
  const neighbours = (ti: number): { key: string; k: number; other: number; angle: number }[] => {
    const out = [];
    const t = tris[ti];
    for (let k = 0; k < 3; k++) {
      const key = edgeKey(t.v[k], t.v[(k + 1) % 3]);
      for (const e of edges.get(key) ?? []) {
        if (e.tri === ti) continue;
        out.push({ key, k, other: e.tri, angle: Math.acos(Math.min(1, Math.max(-1, t.n.dot(tris[e.tri].n)))) });
      }
    }
    return out;
  };

  /** Montagne : le voisin passe sous le plan du parent (pli convexe vu de l'extérieur) ; vallée sinon ; à plat si l'angle est quasi nul. */
  const foldKind = (parent: Tri, child: Tri, angle: number): FoldKind => {
    if (angle < (2 * Math.PI) / 180) return 'flat';
    const c = new Vector3().add(pts[child.v[0]]).add(pts[child.v[1]]).add(pts[child.v[2]]).multiplyScalar(1 / 3);
    return c.sub(pts[parent.v[0]]).dot(parent.n) < 0 ? 'mountain' : 'valley';
  };

  const islandOfTri = new Int32Array(tris.length).fill(-1);
  const placedQ = new Map<number, [Vector2, Vector2, Vector2]>();
  const joined = new Set<string>();
  const islands: Island[] = [];
  const unplaced = new Set<number>();
  tris.forEach((t, i) => { if (t.area >= eps * eps) unplaced.add(i); });
  const bbox = (q: Vector2[]) => ({ minX: Math.min(...q.map((p) => p.x)), maxX: Math.max(...q.map((p) => p.x)), minY: Math.min(...q.map((p) => p.y)), maxY: Math.max(...q.map((p) => p.y)) });

  while (unplaced.size) {
    const islandIdx = islands.length;
    const island: Island = { tris: [], folds: [], cuts: [] };
    islands.push(island);
    const boxes: ReturnType<typeof bbox>[] = [];
    const ext = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    const place = (ti: number, q: [Vector2, Vector2, Vector2]) => {
      placedQ.set(ti, q);
      islandOfTri[ti] = islandIdx;
      island.tris.push({ tri: ti, q });
      const b = bbox(q);
      boxes.push(b);
      ext.minX = Math.min(ext.minX, b.minX); ext.maxX = Math.max(ext.maxX, b.maxX);
      ext.minY = Math.min(ext.minY, b.minY); ext.maxY = Math.max(ext.maxY, b.maxY);
      unplaced.delete(ti);
    };
    /** La pièce tiendrait-elle encore dans la page (dans un sens ou dans l'autre) avec ce triangle en plus ? */
    const fits = (q: Vector2[]): boolean => {
      if (island.tris.length >= maxTris) return false;
      const b = bbox(q);
      const w = Math.max(ext.maxX, b.maxX) - Math.min(ext.minX, b.minX);
      const h = Math.max(ext.maxY, b.maxY) - Math.min(ext.minY, b.minY);
      return Math.max(w, h) <= maxLong && Math.min(w, h) <= maxShort;
    };
    const overlaps = (q: Vector2[]): boolean => {
      const b = bbox(q);
      for (let i = 0; i < island.tris.length; i++) {
        const o = boxes[i];
        if (b.maxX < o.minX - eps || b.minX > o.maxX + eps || b.maxY < o.minY - eps || b.minY > o.maxY + eps) continue;
        if (polysOverlap(q, island.tris[i].q, eps)) return true;
      }
      return false;
    };

    // graine : le plus grand triangle restant
    let seed = -1, best = -1;
    for (const i of unplaced) if (tris[i].area > best) { best = tris[i].area; seed = i; }
    {
      const t = tris[seed];
      const p0 = pts[t.v[0]], p1 = pts[t.v[1]], p2 = pts[t.v[2]];
      const E = p1.clone().sub(p0), L = E.length(); E.divideScalar(L);
      const N = new Vector3().crossVectors(t.n, E);
      const d = p2.clone().sub(p0);
      place(seed, [new Vector2(0, 0), new Vector2(L, 0), new Vector2(d.dot(E), d.dot(N))]);
    }

    /** Position 2D du triangle `child` posé contre l'arête `k` de `parent` (déjà posé), de l'autre côté. */
    const placeAcross = (parent: number, k: number, child: number): [Vector2, Vector2, Vector2] | null => {
      const pt = tris[parent], ct = tris[child], pq = placedQ.get(parent)!;
      const s0 = pt.v[k], s1 = pt.v[(k + 1) % 3];
      const q0 = pq[k], q1 = pq[(k + 1) % 3], qParent = pq[(k + 2) % 3];
      const kw = ct.v.findIndex((v) => v !== s0 && v !== s1);
      if (kw < 0) return null;
      const P0 = pts[s0], P1 = pts[s1], PW = pts[ct.v[kw]];
      const E3 = P1.clone().sub(P0), L = E3.length(); E3.divideScalar(L);
      const d = PW.clone().sub(P0);
      const x = d.dot(E3), y = d.clone().addScaledVector(E3, -x).length();
      const E = q1.clone().sub(q0).divideScalar(L);
      let N = new Vector2(-E.y, E.x);
      let qw = q0.clone().addScaledVector(E, x).addScaledVector(N, y);
      if (Math.sign(side(q0, q1, qw)) === Math.sign(side(q0, q1, qParent))) { N = N.negate(); qw = q0.clone().addScaledVector(E, x).addScaledVector(N, y); }
      return ct.v.map((v) => (v === s0 ? q0.clone() : v === s1 ? q1.clone() : qw)) as [Vector2, Vector2, Vector2];
    };
    /** De combien l'encombrement de la pièce grandirait avec ce triangle (on préfère les pièces compactes). */
    const growth = (q: Vector2[]): number => {
      const b = bbox(q);
      const w = Math.max(ext.maxX, b.maxX) - Math.min(ext.minX, b.minX);
      const h = Math.max(ext.maxY, b.maxY) - Math.min(ext.minY, b.minY);
      return w * h - (ext.maxX - ext.minX) * (ext.maxY - ext.minY);
    };

    // candidats : arêtes entre un triangle posé et un triangle libre ; à chaque tour, celui qui agrandit le moins la pièce
    const cands: { parent: number; k: number; child: number; key: string; angle: number; q: [Vector2, Vector2, Vector2] }[] = [];
    const pushCands = (ti: number) => {
      for (const n of neighbours(ti)) {
        if (!unplaced.has(n.other)) continue;
        const q = placeAcross(ti, n.k, n.other);
        if (q) cands.push({ parent: ti, k: n.k, child: n.other, key: n.key, angle: n.angle, q });
      }
    };
    pushCands(seed);
    while (cands.length) {
      for (let i = cands.length - 1; i >= 0; i--) if (!unplaced.has(cands[i].child)) { cands[i] = cands[cands.length - 1]; cands.pop(); }
      if (!cands.length) break;
      let bi = 0, bs = Infinity;
      for (let i = 0; i < cands.length; i++) {
        const s = growth(cands[i].q) * (1 + cands[i].angle); // à encombrement égal, l'arête la plus plate
        if (s < bs) { bs = s; bi = i; }
      }
      const c = cands[bi];
      cands[bi] = cands[cands.length - 1]; cands.pop();
      if (!fits(c.q) || overlaps(c.q)) continue; // il attend une autre arête, ou une autre pièce
      const pq = placedQ.get(c.parent)!;
      place(c.child, c.q);
      joined.add(c.key);
      island.folds.push({ a: pq[c.k].clone(), b: pq[(c.k + 1) % 3].clone(), kind: foldKind(tris[c.parent], tris[c.child], c.angle) });
      pushCands(c.child);
    }
  }

  // arêtes coupées : numérotées par paire, languette sur le côté du triangle de plus petit indice
  const labelOf = new Map<string, number>();
  let labels = 0;
  for (const island of islands) {
    for (const { tri, q } of island.tris) {
      const t = tris[tri];
      for (let k = 0; k < 3; k++) {
        const key = edgeKey(t.v[k], t.v[(k + 1) % 3]);
        if (joined.has(key)) continue;
        const others = (edges.get(key) ?? []).filter((e) => e.tri !== tri);
        let label = 0, tab = false;
        if (others.length) {
          label = labelOf.get(key) ?? (labelOf.set(key, ++labels), labels);
          tab = tri < Math.min(...others.map((e) => e.tri));
        }
        island.cuts.push({ a: q[k].clone(), b: q[(k + 1) % 3].clone(), label, tab });
      }
    }
  }
  return { islands, islandOfTri, labels };
}
