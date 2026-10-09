import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';

/**
 * Maillage éditable à la main (sommets partagés + triangles indexés), pour le mode édition :
 * - supprimer un sommet : les triangles autour sont retirés et le trou est retriangulé (n triangles → n − 2) ;
 * - fusionner une arête : ses deux bouts se rejoignent au milieu, les deux triangles qui la bordent disparaissent.
 */
export type Tri = [number, number, number];

export class EditMesh {
  constructor(public pts: Vector3[], public tris: Tri[]) {}

  /** Soude les sommets confondus d'une géométrie non indexée (clé numérique par cellule de 10 µm, vérification exacte dans la cellule). */
  static fromGeometry(geo: BufferGeometry): EditMesh {
    const p = geo.attributes.position.array;
    const pts: Vector3[] = [];
    const qx: number[] = [], qy: number[] = [], qz: number[] = []; // coordonnées quantifiées de chaque sommet gardé
    const buckets = new Map<number, number[]>();
    const idOf = (x: number, y: number, z: number) => {
      const ix = Math.round(x * 1e5), iy = Math.round(y * 1e5), iz = Math.round(z * 1e5);
      const h = ((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) | 0;
      let b = buckets.get(h);
      if (b) for (const id of b) if (qx[id] === ix && qy[id] === iy && qz[id] === iz) return id;
      const id = pts.length;
      pts.push(new Vector3(x, y, z)); qx.push(ix); qy.push(iy); qz.push(iz);
      if (b) b.push(id); else buckets.set(h, [id]);
      return id;
    };
    const tris: Tri[] = [];
    for (let t = 0; t < p.length; t += 9) {
      const tri: Tri = [idOf(p[t], p[t + 1], p[t + 2]), idOf(p[t + 3], p[t + 4], p[t + 5]), idOf(p[t + 6], p[t + 7], p[t + 8])];
      if (tri[0] !== tri[1] && tri[1] !== tri[2] && tri[0] !== tri[2]) tris.push(tri);
    }
    return new EditMesh(pts, tris);
  }

  /** Géométrie non indexée (normales plates), sans les sommets devenus orphelins. */
  toGeometry(): BufferGeometry {
    const out = new Float32Array(this.tris.length * 9);
    let o = 0;
    for (const t of this.tris) for (let k = 0; k < 3; k++) { const q = this.pts[t[k]]; out[o++] = q.x; out[o++] = q.y; out[o++] = q.z; }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(out, 3));
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }

  clone(): EditMesh {
    return new EditMesh(this.pts.map((p) => p.clone()), this.tris.map((t) => [...t] as Tri));
  }

  /** Fusionne les sommets a et b (au milieu) : les triangles qui portaient l'arête a-b disparaissent. */
  collapseEdge(a: number, b: number): void {
    this.pts[a].add(this.pts[b]).multiplyScalar(0.5);
    this.tris = this.tris
      .map((t) => t.map((v) => (v === b ? a : v)) as Tri)
      .filter((t) => t[0] !== t[1] && t[1] !== t[2] && t[0] !== t[2]);
  }

  /** Longueur médiane des arêtes (pour choisir des tolérances à l'échelle du maillage). */
  medianEdge(): number {
    const lens: number[] = [];
    for (const t of this.tris) for (let k = 0; k < 3; k++) lens.push(this.pts[t[k]].distanceTo(this.pts[t[(k + 1) % 3]]));
    lens.sort((a, b) => a - b);
    return lens[lens.length >> 1] ?? 0;
  }

  /**
   * Symétrise par rapport au plan { p · n = d } : les sommets du bord ouvert proches du plan (à moins de `snap`) sont ramenés
   * dessus, les triangles couchés dans le plan sont retirés, puis tout est recopié en miroir (orientation inversée) en partageant
   * les sommets qui sont sur le plan. Résultat : un maillage fermé et parfaitement symétrique.
   */
  mirror(n: Vector3, d: number, snap: number): void {
    const dist = (p: Vector3) => p.dot(n) - d;
    // sommets de bord : sur une arête qui n'a qu'un seul triangle
    const edgeCount = new Map<string, number>();
    const key = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
    for (const t of this.tris) for (let k = 0; k < 3; k++) edgeCount.set(key(t[k], t[(k + 1) % 3]), (edgeCount.get(key(t[k], t[(k + 1) % 3])) ?? 0) + 1);
    const boundary = new Set<number>();
    for (const t of this.tris) for (let k = 0; k < 3; k++) if (edgeCount.get(key(t[k], t[(k + 1) % 3])) === 1) { boundary.add(t[k]); boundary.add(t[(k + 1) % 3]); }
    for (const v of boundary) { const p = this.pts[v], s = dist(p); if (Math.abs(s) < snap) p.addScaledVector(n, -s); }
    const eps = 1e-6;
    this.tris = this.tris.filter((t) => !t.every((v) => Math.abs(dist(this.pts[v])) < eps));
    // miroir : un sommet sur le plan reste lui-même, les autres sont reflétés
    const twin = new Map<number, number>();
    const reflect = (v: number): number => {
      let w = twin.get(v);
      if (w !== undefined) return w;
      const p = this.pts[v], s = dist(p);
      if (Math.abs(s) < eps) w = v;
      else { w = this.pts.length; this.pts.push(p.clone().addScaledVector(n, -2 * s)); }
      twin.set(v, w);
      return w;
    };
    const mirrored: Tri[] = this.tris.map((t) => [reflect(t[0]), reflect(t[2]), reflect(t[1])]); // ordre inversé : la face reste tournée vers l'extérieur
    this.tris = this.tris.concat(mirrored.filter((t) => t[0] !== t[1] && t[1] !== t[2] && t[0] !== t[2]));
  }

  /** Retire le sommet v et retriangule le trou laissé par les triangles qui le touchaient. Renvoie false si impossible (bord ouvert, trou non simple). */
  removeVertex(v: number): boolean {
    const ring = this.tris.filter((t) => t.includes(v));
    if (ring.length < 3) return false;
    // arêtes opposées à v, orientées comme dans leurs triangles : elles forment la boucle du trou
    const next = new Map<number, number>();
    for (const t of ring) {
      const i = t.indexOf(v);
      next.set(t[(i + 1) % 3], t[(i + 2) % 3]);
    }
    if (next.size !== ring.length) return false; // sommet de bord ou arête partagée par plus de deux triangles
    const loop: number[] = [];
    let cur = next.keys().next().value as number;
    for (let n = 0; n < next.size; n++) {
      loop.push(cur);
      cur = next.get(cur)!;
      if (cur === undefined) return false;
    }
    if (cur !== loop[0]) return false; // la boucle ne se referme pas
    const filled = earClip(loop, this.pts);
    this.tris = this.tris.filter((t) => !t.includes(v)).concat(filled);
    return true;
  }
}

/**
 * Triangule un polygone (indices) par découpage des « oreilles », dans le plan moyen de la boucle.
 * Si le polygone est trop tordu, on retombe sur un éventail depuis le premier sommet.
 */
function earClip(loop: number[], pts: Vector3[]): Tri[] {
  if (loop.length === 3) return [[loop[0], loop[1], loop[2]]];
  // normale moyenne (Newell) et base 2D
  const n = new Vector3();
  for (let i = 0; i < loop.length; i++) {
    const a = pts[loop[i]], b = pts[loop[(i + 1) % loop.length]];
    n.x += (a.y - b.y) * (a.z + b.z); n.y += (a.z - b.z) * (a.x + b.x); n.z += (a.x - b.x) * (a.y + b.y);
  }
  if (n.lengthSq() < 1e-18) return fan(loop);
  n.normalize();
  const u = new Vector3().crossVectors(n, Math.abs(n.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0)).normalize();
  const w = new Vector3().crossVectors(n, u);
  const P = loop.map((i) => [pts[i].dot(u), pts[i].dot(w)] as [number, number]);
  const cross = (a: [number, number], b: [number, number], c: [number, number]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p: [number, number], a: [number, number], b: [number, number], c: [number, number]) =>
    cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  const idx = loop.map((_, i) => i);
  const out: Tri[] = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 1000) {
    let cut = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length];
      if (cross(P[i0], P[i1], P[i2]) <= 0) continue; // angle rentrant
      let ok = true;
      for (const j of idx) if (j !== i0 && j !== i1 && j !== i2 && inside(P[j], P[i0], P[i1], P[i2])) { ok = false; break; }
      if (!ok) continue;
      out.push([loop[i0], loop[i1], loop[i2]]);
      idx.splice(k, 1);
      cut = true;
      break;
    }
    if (!cut) return fan(loop); // polygone trop tordu pour la méthode
  }
  if (idx.length === 3) out.push([loop[idx[0]], loop[idx[1]], loop[idx[2]]]);
  return out;
}

const fan = (loop: number[]): Tri[] => {
  const out: Tri[] = [];
  for (let i = 1; i + 1 < loop.length; i++) out.push([loop[0], loop[i], loop[i + 1]]);
  return out;
};
