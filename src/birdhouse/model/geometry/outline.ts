import { type Pt, type Edge, type Plank } from '../types';

/** Contour d'une plaque (sens trigonométrique, centré), crans compris. Un cran qui atteint un coin entame le coin (pas de sliver). */
export function outline(p: Plank): Pt[] {
  if (p.poly) return p.poly.map(([x, y]) => [x, y] as Pt);
  const W = p.w, H = p.h;
  // les quatre bords dans l'ordre du contour : point de départ, direction, longueur, normale vers l'intérieur, et comment on convertit la position « utilisateur » en abscisse le long du bord
  const edges: { id: Edge; A: Pt; d: Pt; L: number; n: Pt; s: (pos: number) => number }[] = [
    { id: 'bottom', A: [-W / 2, -H / 2], d: [1, 0], L: W, n: [0, 1], s: (pos) => pos },
    { id: 'right', A: [W / 2, -H / 2], d: [0, 1], L: H, n: [-1, 0], s: (pos) => pos },
    { id: 'top', A: [W / 2, H / 2], d: [-1, 0], L: W, n: [0, -1], s: (pos) => W - pos },
    { id: 'left', A: [-W / 2, H / 2], d: [0, -1], L: H, n: [1, 0], s: (pos) => H - pos },
  ];
  type N = { s0: number; s1: number; depth: number };
  const lists: N[][] = edges.map((e) => p.notches.filter((n) => n.edge === e.id)
    .map((n) => { const s = e.s(n.pos), hw = n.width / 2; return { s0: Math.max(0, s - hw), s1: Math.min(e.L, s + hw), depth: Math.min(n.depth, (e.id === 'top' || e.id === 'bottom' ? H : W) - 1) }; })
    .filter((n) => n.s1 - n.s0 >= 0.2)
    .sort((a, b) => a.s0 - b.s0));
  /**
   * Coin k (entre le bord k et le bord k + 1) : A = dernier cran du bord k s'il atteint le coin, B = premier cran du bord k + 1 s'il part du coin.
   * Les deux rectangles se recouvrent au coin : on contourne leur union (sinon il reste un bout de matière entre les deux — le « résidu »).
   * Repère du coin : p = vers l'arrière le long du bord k, q = le long du bord k + 1. A = [0, wA] × [0, dA], B = [0, dB] × [0, wB].
   */
  const corner = (k: number) => {
    const nk = lists[k], nn = lists[(k + 1) % 4];
    const A = nk.length && nk[nk.length - 1].s1 >= edges[k].L - 0.01 ? nk[nk.length - 1] : null;
    const B = nn.length && nn[0].s0 <= 0.01 ? nn[0] : null;
    if (!A && !B) return null;
    const wA = A ? A.s1 - A.s0 : 0, dA = A ? A.depth : 0, wB = B ? B.s1 - B.s0 : 0, dB = B ? B.depth : 0;
    const C = edges[(k + 1) % 4].A, pv: Pt = [-edges[k].d[0], -edges[k].d[1]], qv = edges[(k + 1) % 4].d;
    const P = (pp: number, qq: number): Pt => [C[0] + pv[0] * pp + qv[0] * qq, C[1] + pv[1] * pp + qv[1] * qq];
    const path: Pt[] = [];
    let end: number;
    if (wA >= dB) { // A va plus loin le long du bord k : on descend par A, puis B dépasse-t-il vers le haut ?
      path.push(P(wA, 0), P(wA, dA));
      if (wB > dA) { path.push(P(dB, dA), P(dB, wB)); end = wB; } else end = dA;
    } else { // B va plus loin le long du bord k
      path.push(P(dB, 0), P(dB, wB));
      if (dA > wB) { path.push(P(wA, wB), P(wA, dA)); end = dA; } else end = wB;
    }
    path.push(P(0, end)); // sur le bord k + 1, à `end` du coin
    return { A, B, path, end };
  };
  const corners = [0, 1, 2, 3].map(corner);
  const pts: Pt[] = [];
  for (let k = 0; k < 4; k++) {
    const e = edges[k], ns = lists[k], before = corners[(k + 3) % 4], after = corners[k];
    const at = (s: number, o: number): Pt => [e.A[0] + e.d[0] * s + e.n[0] * o, e.A[1] + e.d[1] * s + e.n[1] * o];
    let cursor = before ? before.end : 0;
    if (!before) pts.push(e.A); // coin intact ; sinon le contour arrive déjà sur ce bord, à `end` du coin
    const first = before?.B ? 1 : 0, last = after?.A ? ns.length - 1 : ns.length; // les crans de coin sont tracés par le coin
    for (let i = first; i < last; i++) {
      const n = ns[i];
      const s0 = Math.max(n.s0, cursor), s1 = n.s1;
      if (s1 - s0 < 0.2) continue;
      pts.push(at(s0, 0), at(s0, n.depth), at(s1, n.depth), at(s1, 0));
      cursor = s1;
    }
    if (after) pts.push(...after.path);
  }
  return pts;
}
