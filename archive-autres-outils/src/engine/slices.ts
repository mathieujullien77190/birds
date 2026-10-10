import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Matrix4, Path, Shape, Vector2, Vector3 } from 'three';

/**
 * Tranches à découper au laser : pour chaque plan (un par trait gardé), le contour de la coupe plan/modèle à l'échelle
 * réelle (mm), creusé en cadre si on veut (paroi de largeur donnée) ; plus un aperçu 3D où chaque tranche a une épaisseur.
 * Les tranches peuvent se croiser : on ne calcule pas d'encoches.
 */

export interface SlicePlane { normal: Vector3; point: Vector3; family?: 0 | 1 }

export interface Slice {
  index: number;
  family: 0 | 1 | undefined;
  /** Contours extérieurs (mm), ramenés à l'origine. */
  outer: Vector2[][];
  /** Contours intérieurs (vide creux). */
  inner: Vector2[][];
  /** Encoches : rectangles à couper, qui dépassent du bord d'1 mm pour ouvrir l'entaille. */
  slots: Vector2[][];
  w: number;
  h: number;
  /** Nombre de trous du maillage pontés sur cette tranche. */
  bridged: number;
}

export interface SlicePage { items: { slice: Slice; x: number; y: number }[] }
export interface SlicesResult { slices: Slice[]; pages: SlicePage[]; tooBig: number[]; joints: number }

export interface SliceOptions {
  /** Millimètres par unité du modèle. */
  mmPerUnit: number;
  /** Épaisseur du matériau (mm) : aperçu 3D et largeur des encoches. */
  thickness: number;
  /** Largeur de paroi (mm) pour des tranches creuses ; 0 ou absent = pleines. */
  wall?: number;
  /** Encoches à mi-bois entre les plans de famille 0 et ceux de famille 1. */
  notches?: boolean;
  page?: PageSpec;
}

export interface PageSpec { w: number; h: number; margin: number }
export const A4: PageSpec = { w: 210, h: 297, margin: 8 };

/** Couleurs des tranches dans l'aperçu 3D. */
export const SLICE_COLORS = ['#f4c7c3', '#fde2b3', '#fbf2b0', '#cfe8c6', '#c3e4e8', '#c9d4f4', '#e3cdf1', '#f3d1e4', '#d8d2c4', '#cfe0d2', '#f0d9c0', '#d6dfe8'];

// ----- contours de coupe -----

/** Courbe de raccord (Hermite cubique) entre la fin d'une chaîne et le début d'une autre : le contour passe le trou sans cassure. */
export function bridge(from: Vector3[], to: Vector3[]): Vector3[] {
  const p0 = from[from.length - 1], p1 = to[0];
  const L = p0.distanceTo(p1);
  if (L < 1e-9) return [];
  const t0 = from.length > 1 ? p0.clone().sub(from[from.length - 2]).normalize().multiplyScalar(L) : p1.clone().sub(p0);
  const t1 = to.length > 1 ? to[1].clone().sub(p1).normalize().multiplyScalar(L) : p1.clone().sub(p0);
  const step = from.length > 1 ? from[from.length - 1].distanceTo(from[from.length - 2]) : L;
  const steps = Math.max(4, Math.min(32, Math.round(L / Math.max(step, 1e-6))));
  const out: Vector3[] = [];
  for (let i = 1; i < steps; i++) {
    const s = i / steps, s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    out.push(p0.clone().multiplyScalar(h00).addScaledVector(t0, h10).addScaledVector(p1, h01).addScaledVector(t1, h11));
  }
  return out;
}

/** Contours fermés de l'intersection du plan (n, d : p·n = d) avec un maillage non indexé ; les bouts ouverts (trous) sont pontés. */
export function sectionContours(pos: ArrayLike<number>, n: Vector3, d: number): { polys: Vector3[][]; holes: number } {
  const segs: [Vector3, Vector3][] = [];
  const P = [new Vector3(), new Vector3(), new Vector3()];
  for (let t = 0; t + 8 < pos.length; t += 9) {
    P[0].set(pos[t], pos[t + 1], pos[t + 2]); P[1].set(pos[t + 3], pos[t + 4], pos[t + 5]); P[2].set(pos[t + 6], pos[t + 7], pos[t + 8]);
    const S = [P[0].dot(n) - d, P[1].dot(n) - d, P[2].dot(n) - d];
    const pts: Vector3[] = [];
    for (let k = 0; k < 3; k++) {
      const sa = S[k], sb = S[(k + 1) % 3];
      if ((sa < 0) === (sb < 0)) continue;
      pts.push(P[k].clone().lerp(P[(k + 1) % 3], sa / (sa - sb)));
    }
    if (pts.length === 2 && pts[0].distanceToSquared(pts[1]) > 1e-16) segs.push([pts[0], pts[1]]);
  }
  if (!segs.length) return { polys: [], holes: 0 };
  const key = (p: Vector3) => `${Math.round(p.x * 1e5)},${Math.round(p.y * 1e5)},${Math.round(p.z * 1e5)}`;
  const nodes: Vector3[] = [];
  const ids = new Map<string, number>();
  const idOf = (p: Vector3) => { const k = key(p); let i = ids.get(k); if (i === undefined) { i = nodes.length; ids.set(k, i); nodes.push(p); } return i; };
  const adj = new Map<number, number[]>();
  for (const [p, q] of segs) {
    const i = idOf(p), j = idOf(q);
    if (i === j) continue;
    adj.set(i, [...(adj.get(i) ?? []), j]);
    adj.set(j, [...(adj.get(j) ?? []), i]);
  }
  const usedEdge = new Set<string>();
  const ek = (i: number, j: number) => (i < j ? `${i}_${j}` : `${j}_${i}`);
  const walk = (start: number) => {
    const chain = [start];
    let cur = start;
    for (let guard = 0; guard < nodes.length * 2; guard++) {
      const nxt = (adj.get(cur) ?? []).find((j) => !usedEdge.has(ek(cur, j)));
      if (nxt === undefined) break;
      usedEdge.add(ek(cur, nxt));
      chain.push(nxt);
      cur = nxt;
      if (cur === start) break;
    }
    return chain;
  };
  const chains: number[][] = [];
  const visitedStart = new Set<number>();
  for (const [i, nb] of adj) if (nb.length === 1 && !visitedStart.has(i)) { const c = walk(i); visitedStart.add(c[c.length - 1]); chains.push(c); }
  for (const [i, nb] of adj) if (nb.some((j) => !usedEdge.has(ek(i, j)))) chains.push(walk(i));
  const open = chains.filter((c) => c[0] !== c[c.length - 1]);
  const polys: Vector3[][] = chains.filter((c) => c[0] === c[c.length - 1]).map((c) => c.map((i) => nodes[i]));
  const remaining = open.map((c) => c.map((i) => nodes[i]));
  while (remaining.length) {
    let chain = remaining.shift()!;
    for (let guard = 0; guard < 1000 && remaining.length; guard++) {
      const end = chain[chain.length - 1];
      let bi = -1, bd = Infinity, flip = false;
      remaining.forEach((o, i) => {
        const d0 = end.distanceTo(o[0]), d1 = end.distanceTo(o[o.length - 1]);
        if (d0 < bd) { bd = d0; bi = i; flip = false; }
        if (d1 < bd) { bd = d1; bi = i; flip = true; }
      });
      if (bi < 0 || bd > chain[0].distanceTo(end)) break;
      const other = remaining.splice(bi, 1)[0];
      if (flip) other.reverse();
      chain = chain.concat(bridge(chain, other), other);
    }
    chain = chain.concat(bridge(chain, chain.slice(0, 2)), [chain[0]]);
    polys.push(chain);
  }
  return { polys, holes: open.length };
}

/** Base (u, v) d'un plan : u horizontal si possible, v = n × u. */
export function planeBasis(n: Vector3): { u: Vector3; v: Vector3 } {
  const helper = Math.abs(n.z) < 0.9 ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0);
  const u = new Vector3().crossVectors(helper, n).normalize();
  const v = new Vector3().crossVectors(n, u).normalize();
  return { u, v };
}

// ----- géométrie 2D -----

const area2 = (poly: Vector2[]) => { let a = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p.x * q.y - q.x * p.y; } return a / 2; };
const inside = (pt: Vector2, poly: Vector2[]) => {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) ins = !ins;
  }
  return ins;
};

/** Simplification de Douglas-Peucker d'un contour fermé (tolérance en mm) : moins de points, découpe plus propre. */
function simplifyClosed(poly: Vector2[], tol: number): Vector2[] {
  if (poly.length < 8) return poly;
  let far = 0, fd = -1;
  poly.forEach((p, i) => { const d = p.distanceToSquared(poly[0]); if (d > fd) { fd = d; far = i; } });
  const a = rdp(poly.slice(0, far + 1), tol), b = rdp([...poly.slice(far), poly[0]], tol);
  return [...a, ...b.slice(1, -1)];
}
function rdp(pts: Vector2[], tol: number): Vector2[] {
  if (pts.length < 3) return pts;
  const a = pts[0], b = pts[pts.length - 1];
  const L = a.distanceTo(b);
  let far = -1, fd = tol;
  for (let i = 1; i + 1 < pts.length; i++) {
    const p = pts[i];
    const d = L < 1e-9 ? p.distanceTo(a) : Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / L;
    if (d > fd) { fd = d; far = i; }
  }
  if (far < 0) return [a, b];
  return [...rdp(pts.slice(0, far + 1), tol).slice(0, -1), ...rdp(pts.slice(far), tol)];
}

/** Contour décalé vers l'intérieur de `w` mm (coins en onglet, limités), ou null s'il s'effondre. */
function inset(poly: Vector2[], w: number): Vector2[] | null {
  const n = poly.length;
  if (n < 3) return null;
  const sign = area2(poly) > 0 ? 1 : -1; // sens direct : l'intérieur est à gauche des arêtes
  const normals = poly.map((p, i) => { const q = poly[(i + 1) % n]; const e = q.clone().sub(p).normalize(); return new Vector2(-e.y, e.x).multiplyScalar(sign); });
  const out: Vector2[] = [];
  for (let i = 0; i < n; i++) {
    const n0 = normals[(i + n - 1) % n], n1 = normals[i];
    const denom = 1 + n0.dot(n1);
    const dir = n0.clone().add(n1);
    if (dir.lengthSq() < 1e-12) { out.push(poly[i].clone().addScaledVector(n1, w)); continue; }
    // onglet : p + (n0 + n1) / (1 + n0·n1) · w (exactement w sur un bord droit) ; longueur limitée à 2,5 w dans les coins aigus
    if (denom < 0.4) out.push(poly[i].clone().addScaledVector(dir.normalize(), 2.5 * w));
    else out.push(poly[i].clone().addScaledVector(dir, w / denom));
  }
  // nettoyage : on enlève les points dont l'arête s'est retournée, et ceux qui sont trop près du bord extérieur
  // (pointes étroites : la paroi y serait plus fine que w, le vide s'arrête avant) ; l'aire doit rester du bon signe et suffisante
  const distToEdge = (p: Vector2) => {
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n], ab = b.clone().sub(a);
      const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-12)));
      best = Math.min(best, a.clone().addScaledVector(ab, t).distanceTo(p));
    }
    return best;
  };
  const cleaned = out.filter((p, i) => {
    const q = out[(i + 1) % n], e = q.clone().sub(p), e0 = poly[(i + 1) % n].clone().sub(poly[i]);
    return e.dot(e0) > 0 && distToEdge(p) > 0.85 * w;
  });
  if (cleaned.length < 3) return null;
  const a0 = area2(poly), a1 = area2(cleaned);
  if (Math.sign(a1) !== Math.sign(a0) || Math.abs(a1) < w * w * 2) return null;
  return cleaned;
}

/** Abscisses t des intersections d'une droite 2D o + t·d avec les arêtes des contours, triées. */
function lineCrossings(o: Vector2, dir: Vector2, polys: Vector2[][]): number[] {
  const ts: number[] = [];
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const ex = q.x - p.x, ey = q.y - p.y;
      const den = dir.x * ey - dir.y * ex;
      if (Math.abs(den) < 1e-12) continue;
      const px = p.x - o.x, py = p.y - o.y;
      const t = (px * ey - py * ex) / den;
      const s = (px * dir.y - py * dir.x) / den;
      if (s >= 0 && s < 1) ts.push(t);
    }
  }
  return ts.sort((a, b) => a - b);
}

/** Intervalles [t1, t2] où la droite traverse de la matière (parité des croisements, contours extérieurs et intérieurs confondus). */
function materialIntervals(ts: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < ts.length; i += 2) out.push([ts[i], ts[i + 1]]);
  return out;
}

// ----- tranches -----

interface Working { index: number; family: 0 | 1 | undefined; plane: SlicePlane; u: Vector3; v: Vector3; outer: Vector2[][]; inner: Vector2[][]; slots: Vector2[][]; bridged: number }

/**
 * Encoches à mi-bois entre une tranche A (famille 0) et une tranche B (famille 1) : le long de la droite d'intersection des deux
 * plans, chaque intervalle où les deux ont de la matière est partagé en deux : A est entaillée du côté t1 jusqu'au milieu,
 * B du milieu jusqu'au côté t2, en largeur = épaisseur. Même abscisse t (mm) sur les deux tranches, donc même sens pour toutes
 * les paires : A s'emboîte toujours par un côté, B par l'autre.
 */
function notch(A: Working, B: Working, thickness: number, mmPerUnit: number): number {
  const nA = A.plane.normal, nB = B.plane.normal;
  const dir3 = new Vector3().crossVectors(nA, nB);
  if (dir3.lengthSq() < 1e-6) return 0; // plans parallèles
  dir3.normalize();
  const dA = nA.dot(A.plane.point), dB = nB.dot(B.plane.point), c = nA.dot(nB);
  const den = 1 - c * c;
  const p3 = nA.clone().multiplyScalar((dA - dB * c) / den).add(nB.clone().multiplyScalar((dB - dA * c) / den)); // un point de la droite
  const in2 = (W: Working) => {
    const q = p3.clone().sub(W.plane.point);
    return { o: new Vector2(q.dot(W.u) * mmPerUnit, q.dot(W.v) * mmPerUnit), d: new Vector2(dir3.dot(W.u), dir3.dot(W.v)).normalize() };
  };
  const a2 = in2(A), b2 = in2(B);
  const ia = materialIntervals(lineCrossings(a2.o, a2.d, [...A.outer, ...A.inner]));
  const ib = materialIntervals(lineCrossings(b2.o, b2.d, [...B.outer, ...B.inner]));
  const rect = (W: Working, f: { o: Vector2; d: Vector2 }, from: number, to: number) => {
    const n = new Vector2(-f.d.y, f.d.x).multiplyScalar(thickness / 2);
    const p = f.o.clone().addScaledVector(f.d, from), q = f.o.clone().addScaledVector(f.d, to);
    W.slots.push([p.clone().add(n), q.clone().add(n), q.clone().sub(n), p.clone().sub(n)]);
  };
  let made = 0;
  for (const [a0, a1] of ia) for (const [b0, b1] of ib) {
    const t1 = Math.max(a0, b0), t2 = Math.min(a1, b1);
    if (t2 - t1 < thickness) continue; // croisement trop court pour une entaille
    const tm = (t1 + t2) / 2;
    rect(A, a2, t1 - 1, tm); // A : de son bord (côté t1, 1 mm de dépassement) jusqu'au milieu
    rect(B, b2, tm, t2 + 1); // B : du milieu jusqu'à son bord (côté t2)
    made++;
  }
  return made;
}

/** Contours d'une tranche dans le repère (u, v) de son plan, en mm, origine au point du plan. */
function cutSlice(pos: ArrayLike<number>, pl: SlicePlane, index: number, opts: SliceOptions): Working | null {
  const { u, v } = planeBasis(pl.normal);
  const { polys, holes } = sectionContours(pos, pl.normal, pl.normal.dot(pl.point));
  if (!polys.length) return null;
  const outer = polys
    .map((poly) => simplifyClosed(poly.slice(0, -1).map((p) => { const q = p.clone().sub(pl.point); return new Vector2(q.dot(u) * opts.mmPerUnit, q.dot(v) * opts.mmPerUnit); }), 0.15))
    .filter((c) => c.length >= 3 && Math.abs(area2(c)) > 4);
  if (!outer.length) return null;
  const inner: Vector2[][] = [];
  if (opts.wall && opts.wall > 0) for (const c of outer) { const h = inset(c, opts.wall); if (h) inner.push(h); }
  return { index, family: pl.family, plane: pl, u, v, outer, inner, slots: [], bridged: holes };
}

/** Tranches en mm (une par plan), creusées et encochées selon les options, rangées sur des pages. */
export function buildSlices(pos: ArrayLike<number>, planes: SlicePlane[], opts: SliceOptions): SlicesResult {
  const page = opts.page ?? A4;
  const working = planes.map((pl, i) => cutSlice(pos, pl, i, opts)).filter((w): w is Working => !!w);
  let joints = 0;
  if (opts.notches) {
    const fam0 = working.filter((w) => w.family === 0), fam1 = working.filter((w) => w.family === 1);
    for (const a of fam0) for (const b of fam1) joints += notch(a, b, opts.thickness, opts.mmPerUnit);
  }
  const innerW = page.w - page.margin * 2, innerH = page.h - page.margin * 2;
  // mise à l'origine (et couchage des tranches plus larges que la page)
  const slices: Slice[] = working.map((w) => {
    const all = [...w.outer, ...w.inner, ...w.slots];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of all) for (const q of c) { minX = Math.min(minX, q.x); minY = Math.min(minY, q.y); maxX = Math.max(maxX, q.x); maxY = Math.max(maxY, q.y); }
    const pad = 3;
    let W = maxX - minX + 2 * pad, H = maxY - minY + 2 * pad;
    const rotate = W > H && W > innerW;
    for (const c of all) for (const q of c) {
      const x = q.x - minX + pad, y = q.y - minY + pad;
      if (rotate) { q.x = y; q.y = W - x; } else { q.x = x; q.y = y; }
    }
    if (rotate) { const t = W; W = H; H = t; }
    return { index: w.index, family: w.family, outer: w.outer, inner: w.inner, slots: w.slots, w: W, h: H, bridged: w.bridged };
  });
  const tooBig = slices.filter((s) => s.w > innerW || s.h > innerH).map((s) => s.index);
  const order = slices.filter((s) => !tooBig.includes(s.index)).sort((a, b) => b.h - a.h);
  const pages: SlicePage[] = [];
  let cur: SlicePage = { items: [] }, x = 0, y = 0, shelf = 0;
  const gap = 2;
  for (const s of order) {
    if (x + s.w > innerW) { x = 0; y += shelf + gap; shelf = 0; }
    if (y + s.h > innerH) { pages.push(cur); cur = { items: [] }; x = 0; y = 0; shelf = 0; }
    cur.items.push({ slice: s, x: page.margin + x, y: page.margin + y });
    x += s.w + gap;
    shelf = Math.max(shelf, s.h);
  }
  if (cur.items.length) pages.push(cur);
  return { slices, pages, tooBig, joints };
}

// ----- sortie SVG -----

const f = (v: number) => v.toFixed(3);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** SVG d'une planche : coupes en noir 0,1 mm (contours et vides), numéros gravés en bleu. */
export function sliceSvg(page: SlicePage, spec: PageSpec, title: string): string {
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${spec.w}mm" height="${spec.h}mm" viewBox="0 0 ${spec.w} ${spec.h}" font-family="system-ui, sans-serif">`);
  out.push(`<text x="${spec.margin}" y="${spec.margin - 2}" font-size="3" fill="#2563eb">${esc(title)}</text>`);
  for (const { slice, x, y } of page.items) {
    out.push(`<g transform="translate(${f(x)} ${f(y)})">`);
    for (const c of [...slice.outer, ...slice.inner, ...slice.slots]) out.push(`<polygon points="${c.map((p) => `${f(p.x)},${f(p.y)}`).join(' ')}" fill="none" stroke="#000" stroke-width="0.1"/>`);
    const big = slice.outer.reduce((b, c) => (Math.abs(area2(c)) > Math.abs(area2(b)) ? c : b), slice.outer[0]);
    // numéro : sur la paroi si la tranche est creuse (entre le bord et le centre), sinon au centre
    const ctr = big.reduce((m, p) => m.add(p), new Vector2()).divideScalar(big.length);
    const label = slice.inner.length || !inside(ctr, big) ? big[0].clone().add(ctr).multiplyScalar(0.5) : ctr;
    const name = `${slice.family === undefined ? 'T' : slice.family === 0 ? 'A' : 'B'}${slice.index + 1}`;
    out.push(`<text x="${f(label.x)}" y="${f(label.y)}" font-size="3.5" text-anchor="middle" dominant-baseline="middle" fill="#2563eb">${name}</text>`);
    out.push('</g>');
  }
  out.push('</svg>');
  return out.join('\n');
}

/** Page HTML autonome : toutes les planches, un bouton Imprimer, un lien de téléchargement SVG par planche. */
export function slicesHtml(res: SlicesResult, spec: PageSpec, name: string, opts: SliceOptions): string {
  const pages = res.pages.map((p, i) => sliceSvg(p, spec, `${name} · ${opts.thickness} mm${opts.wall ? ` · paroi ${opts.wall} mm` : ''} · planche ${i + 1} / ${res.pages.length}`));
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(name)} · tranches laser</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  body { margin: 0; background: #e5e5e5; font-family: system-ui, sans-serif; }
  .bar { position: sticky; top: 0; background: #fff; padding: 10px 16px; box-shadow: 0 1px 4px #0002; display: flex; gap: 16px; align-items: center; font-size: 14px; flex-wrap: wrap; }
  .bar button { padding: 6px 14px; font-size: 14px; }
  .page { width: ${spec.w}mm; height: ${spec.h}mm; background: #fff; margin: 12px auto; box-shadow: 0 2px 8px #0003; page-break-after: always; position: relative; }
  .page a { position: absolute; top: 3mm; right: 6mm; font-size: 12px; }
  svg { display: block; }
  @media print { body { background: none; } .bar, .page a { display: none; } .page { margin: 0; box-shadow: none; } }
</style></head><body>
<div class="bar"><button onclick="window.print()">Imprimer</button>
<span>${res.slices.length} tranches · matériau ${opts.thickness} mm${opts.wall ? ` · creuses, paroi ${opts.wall} mm` : ''}${opts.notches ? ` · ${res.joints} encoches à mi-bois (les A s'emboîtent par un côté, les B par l'autre)` : ''} · noir 0,1 mm = coupe · bleu = gravure</span></div>
${pages.map((s, i) => `<div class="page"><a download="${esc(name)}-planche-${i + 1}.svg" href="data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}">Télécharger le SVG</a>${s}</div>`).join('\n')}
</body></html>`;
}

// ----- aperçu 3D -----

/** Chaque tranche extrudée de `thickness` mm autour de son plan (cadres si creuses), fusionnée en une géométrie non indexée. */
export function slicesGeometry(pos: ArrayLike<number>, planes: SlicePlane[], opts: SliceOptions): { geo: BufferGeometry; sliceOfTri: Int32Array } {
  const parts: { positions: Float32Array; slice: number }[] = [];
  const k = 1 / opts.mmPerUnit; // mm → unités
  planes.forEach((pl, index) => {
    const w = cutSlice(pos, pl, index, opts);
    if (!w) return;
    const depth = w.outer.map((c, i) => w.outer.filter((o, j) => j !== i && inside(c[0], o)).length);
    const shapes: Shape[] = [];
    w.outer.forEach((c, i) => {
      if (depth[i] % 2 !== 0) return;
      const shape = new Shape(c.map((p) => p.clone().multiplyScalar(k)));
      w.outer.forEach((o, j) => { if (depth[j] === depth[i] + 1 && inside(o[0], c)) shape.holes.push(new Path(o.map((p) => p.clone().multiplyScalar(k)))); });
      for (const h of w.inner) if (inside(h[0], c)) shape.holes.push(new Path(h.map((p) => p.clone().multiplyScalar(k))));
      shapes.push(shape);
    });
    if (!shapes.length) return;
    const g = new ExtrudeGeometry(shapes, { depth: opts.thickness * k, bevelEnabled: false });
    g.applyMatrix4(new Matrix4().makeBasis(w.u, w.v, pl.normal).setPosition(pl.point.clone().addScaledVector(pl.normal, (-opts.thickness * k) / 2)));
    const ng = g.index ? g.toNonIndexed() : g;
    parts.push({ positions: Float32Array.from(ng.attributes.position.array as Float32Array), slice: index });
    g.dispose();
  });
  const total = parts.reduce((n, p) => n + p.positions.length, 0);
  const all = new Float32Array(total);
  const sliceOfTri = new Int32Array(total / 9);
  let o = 0;
  for (const p of parts) { all.set(p.positions, o); sliceOfTri.fill(p.slice, o / 9, (o + p.positions.length) / 9); o += p.positions.length; }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(all, 3));
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return { geo, sliceOfTri };
}
