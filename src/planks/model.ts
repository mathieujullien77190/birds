/**
 * Plaques de bois : des rectangles d'une épaisseur commune, posés librement dans l'espace, avec des crans (encoches
 * rectangulaires) sur leurs bords pour s'emboîter. Tout en millimètres. Repère d'une plaque : x = largeur, y = hauteur,
 * centrée sur son milieu ; l'épaisseur est le long de z, centrée aussi.
 */
import { Euler, MathUtils, Quaternion, Vector3 } from 'three';

export type Vec3 = [number, number, number];
/** Positions gardées au centième de millimètre : les plaques d'une boîte sont à ± une demi-épaisseur (1,5 mm), un arrondi au millimètre les décalerait de 0,5 mm et les crans ne tomberaient plus en face. */
export const r2 = (x: number): number => Math.round(x * 100) / 100;
export type Pt = [number, number];
export type Edge = 'bottom' | 'right' | 'top' | 'left';
export const EDGES: { id: Edge; label: string }[] = [
  { id: 'top', label: 'Haut' }, { id: 'bottom', label: 'Bas' }, { id: 'left', label: 'Gauche' }, { id: 'right', label: 'Droite' },
];

/** Un cran : sur un bord, centré à `pos` (depuis la gauche pour haut / bas, depuis le bas pour gauche / droite), `width` de large, `depth` de profond. */
export interface Notch { id: string; edge: Edge; pos: number; width: number; depth: number }

/** Un trou dans la plaque : rond (diamètre `size`) ou rectangulaire (`size` de long sur `sh` de large, coins arrondis de rayon `r`), centré en (x, y) depuis le centre de la plaque. */
export interface Hole { id: string; shape: 'round' | 'square'; x: number; y: number; size: number; sh?: number; r?: number }

/** Demi-dimensions d'un trou. */
const holeHalf = (h: Hole): [number, number] => (h.shape === 'square' ? [h.size / 2, (h.sh ?? h.size) / 2] : [h.size / 2, h.size / 2]);

/**
 * Ramène un trou entièrement dans la plaque (1 mm de bord au moins) : un trou qui sort du contour casse la triangulation
 * de la face (la plaque s'affiche en lambeaux). Réduit le trou s'il est trop grand, puis le recentre.
 */
export function fitHole(p: Plank, h: Hole): Hole {
  const M = 1;
  const maxW = Math.max(1, p.w - 2 * M), maxH = Math.max(1, p.h - 2 * M);
  let size = h.size, sh = h.sh ?? h.size;
  if (h.shape === 'square') { size = Math.min(size, maxW); sh = Math.min(sh, maxH); } else size = Math.min(size, maxW, maxH);
  const next: Hole = { ...h, size: +size.toFixed(2), sh: h.shape === 'square' ? +sh.toFixed(2) : undefined, r: h.shape === 'square' ? Math.min(h.r ?? 0, size / 2, sh / 2) : undefined };
  const [hw, hh] = holeHalf(next);
  next.x = Math.round(Math.min(Math.max(h.x, -p.w / 2 + M + hw), p.w / 2 - M - hw));
  next.y = Math.round(Math.min(Math.max(h.y, -p.h / 2 + M + hh), p.h / 2 - M - hh));
  return next;
}

export interface Plank {
  id: string;
  name: string;
  w: number;
  h: number;
  /** Position du centre et rotation (degrés, ordre XYZ). */
  pos: Vec3;
  rot: Vec3;
  notches: Notch[];
  holes: Hole[];
  /** Crénelages d'emboîtement actifs, par bord (les crans correspondants sont dans `notches`). */
  cast?: Partial<Record<Edge, { n: number; phase: 0 | 1 }>>;
  /** Affichée en transparence (pour voir dedans). */
  transparent?: boolean;
  /** Plaques liées : même identifiant de groupe → elles se déplacent et tournent ensemble. */
  group?: string;
}

export interface PlankScene { t: number; fit: number; planks: Plank[]; /** Nom des groupes (boîtes…) par identifiant. */ groupNames?: Record<string, string> }

export const uid = (): string => Math.random().toString(36).slice(2, 9);

export const newPlank = (n: number, w = 120, h = 80): Plank => ({ id: uid(), name: `Plaque ${n}`, w, h, pos: [(n - 1) * 40, h / 2, 0], rot: [0, 0, 0], notches: [], holes: [] });
export const newHole = (x: number, y: number): Hole => ({ id: uid(), shape: 'round', x: Math.round(x), y: Math.round(y), size: 10 });

/** Contour d'un trou (sens trigonométrique), pour la découpe et la 3D. */
export function holeOutline(h: Hole): Pt[] {
  const r = h.size / 2;
  if (h.shape === 'square') {
    const [hw, hh] = holeHalf(h);
    const rr = Math.min(h.r ?? 0, hw, hh);
    if (rr <= 0.05) return [[h.x - hw, h.y - hh], [h.x + hw, h.y - hh], [h.x + hw, h.y + hh], [h.x - hw, h.y + hh]];
    // coins arrondis : un quart de cercle de 8 segments à chaque coin, dans le sens trigonométrique
    const out: Pt[] = [];
    const corners: [number, number, number][] = [[h.x + hw - rr, h.y - hh + rr, -Math.PI / 2], [h.x + hw - rr, h.y + hh - rr, 0], [h.x - hw + rr, h.y + hh - rr, Math.PI / 2], [h.x - hw + rr, h.y - hh + rr, Math.PI]];
    for (const [cx, cy, a0] of corners) for (let i = 0; i <= 8; i++) { const a = a0 + (i / 8) * (Math.PI / 2); out.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); }
    return out;
  }
  const n = 32;
  return Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [h.x + r * Math.cos(a), h.y + r * Math.sin(a)] as Pt; });
}
export const newNotch = (plank: Plank, t: number, fit: number): Notch => ({ id: uid(), edge: 'top', pos: plank.w / 2, width: +(t + fit).toFixed(2), depth: Math.round(plank.h / 4) });

export const DEFAULT_SCENE: PlankScene = { t: 3, fit: 0, planks: [] }; // jeu 0 : crans ajustés exactement (le laser enlève déjà ~0,1 mm, ce qui donne le jeu)

const KEY = 'plaques-scene';
export function loadScene(): PlankScene {
  try { const s = JSON.parse(localStorage.getItem(KEY) ?? '') as PlankScene; if (s && Array.isArray(s.planks)) return { ...s, fit: 0, planks: s.planks.map((p) => ({ ...p, notches: p.notches ?? [], holes: p.holes ?? [] })) }; } catch { /* rien */ } // fit : toujours 0 (le réglage n'existe plus)
  return DEFAULT_SCENE;
}
export function saveScene(s: PlankScene): void { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* quota */ } }

/** Historique de « Retour », gardé aussi au rechargement, sans limite (si le navigateur refuse par manque de place, on lâche la moitié la plus ancienne et on réessaie). */
export interface HistoryEntry { label: string; scene: PlankScene; at: number }
const HKEY = 'plaques-historique';
export function loadHistory(): HistoryEntry[] {
  try { const h = JSON.parse(localStorage.getItem(HKEY) ?? '') as HistoryEntry[]; if (Array.isArray(h)) return h; } catch { /* rien */ }
  return [];
}
export function saveHistory(h: HistoryEntry[]): void {
  let keep = h;
  for (let tries = 0; tries < 6; tries++) {
    try { localStorage.setItem(HKEY, JSON.stringify(keep)); return; } catch { keep = keep.slice(Math.ceil(keep.length / 2)); }
  }
}

/** Longueur du bord qui porte un cran. */
export const edgeLength = (p: Plank, edge: Edge): number => (edge === 'top' || edge === 'bottom' ? p.w : p.h);

/**
 * Crénelage d'emboîtement sur un bord : le bord est partagé en `segments` dents égales ; une dent sur deux est creusée
 * (profondeur = épaisseur `t`, pour que l'autre plaque affleure ; largeur = dent + jeu). `phase` 0 : la première dent est
 * creuse, 1 : pleine. La plaque d'en face prend le même crénelage avec l'autre phase.
 */
export function castellation(p: Plank, edge: Edge, segments: number, phase: 0 | 1, t: number, fit: number): Notch[] {
  const L = edgeLength(p, edge), seg = L / segments;
  const out: Notch[] = [];
  for (let i = 0; i < segments; i++) if (i % 2 === phase) out.push({ id: uid(), edge, pos: +((i + 0.5) * seg).toFixed(2), width: +(seg + fit).toFixed(2), depth: t });
  return out;
}

/** Nombre impair de dents pour un bord de longueur `len` (une dente ≈ 15 mm, 3 au moins). */
export const teethFor = (len: number): number => { const n = Math.max(3, Math.round(len / 15)); return n % 2 ? n : n + 1; };

/**
 * Une boîte fermée de l × L × H (dimensions extérieures) en 6 plaques crénelées qui s'emboîtent, posées en place (le dessous sur y = 0).
 * Phases : faces avant / arrière creuses aux bouts sur leurs 4 bords (0) ; côtés pleins aux bouts sur leurs bords verticaux (1), creux en haut / bas (0) ;
 * dessus / dessous pleins aux bouts partout (1). Chaque arête réunit ainsi un bord 0 et un bord 1 ; le nombre de dents dépend de la longueur de l'arête,
 * impair, donc symétrique : l'orientation de chaque plaque n'a pas d'importance.
 */
export function makeBox(l: number, L: number, H: number, t: number, fit: number, start = 1): { planks: Plank[]; group: string; name: string } {
  void fit; // une boîte est toujours créée avec des crans ajustés exactement : la largeur d'un cran = celle d'une dent
  fit = 0;
  const nl = teethFor(l), nL = teethFor(L), nH = teethFor(H);
  const mk = (name: string, w: number, h: number, pos: Vec3, rot: Vec3, edges: Partial<Record<Edge, { n: number; phase: 0 | 1 }>>): Plank => {
    const p: Plank = { id: uid(), name, w, h, pos, rot, notches: [], holes: [], cast: edges, group };
    p.notches = (Object.keys(edges) as Edge[]).flatMap((e) => castellation(p, e, edges[e]!.n, edges[e]!.phase, t, fit));
    return p;
  };
  const y = H / 2, k = start, group = uid(); // les six plaques sont liées : la boîte bouge d'un bloc
  const planks = [
    mk(`Face avant ${k}`, l, H, [0, y, L / 2 - t / 2], [0, 0, 0], { top: { n: nl, phase: 0 }, bottom: { n: nl, phase: 0 }, left: { n: nH, phase: 0 }, right: { n: nH, phase: 0 } }),
    mk(`Face arrière ${k}`, l, H, [0, y, -L / 2 + t / 2], [0, 0, 0], { top: { n: nl, phase: 0 }, bottom: { n: nl, phase: 0 }, left: { n: nH, phase: 0 }, right: { n: nH, phase: 0 } }),
    mk(`Côté droit ${k}`, L, H, [l / 2 - t / 2, y, 0], [0, 90, 0], { top: { n: nL, phase: 0 }, bottom: { n: nL, phase: 0 }, left: { n: nH, phase: 1 }, right: { n: nH, phase: 1 } }),
    mk(`Côté gauche ${k}`, L, H, [-l / 2 + t / 2, y, 0], [0, 90, 0], { top: { n: nL, phase: 0 }, bottom: { n: nL, phase: 0 }, left: { n: nH, phase: 1 }, right: { n: nH, phase: 1 } }),
    mk(`Dessus ${k}`, l, L, [0, H - t / 2, 0], [90, 0, 0], { top: { n: nl, phase: 1 }, bottom: { n: nl, phase: 1 }, left: { n: nL, phase: 1 }, right: { n: nL, phase: 1 } }),
    mk(`Dessous ${k}`, l, L, [0, t / 2, 0], [90, 0, 0], { top: { n: nl, phase: 1 }, bottom: { n: nl, phase: 1 }, left: { n: nL, phase: 1 }, right: { n: nL, phase: 1 } }),
  ];
  return { planks, group, name: `Boîte ${k}` };
}

/** Boîte englobante (monde) d'un ensemble de plaques, rotations comprises. */
export function bounds(planks: Plank[], t: number): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of planks) {
    const [a, b, c] = p.rot.map((d) => (d * Math.PI) / 180);
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
    // matrice de rotation XYZ (ordre de Three.js : R = Rx · Ry · Rz)
    const R = [
      [cb * cc, -cb * sc, sb],
      [ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb],
      [sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb],
    ];
    for (const x of [-p.w / 2, p.w / 2]) for (const y of [-p.h / 2, p.h / 2]) for (const z of [-t / 2, t / 2]) {
      for (let i = 0; i < 3; i++) { const v = R[i][0] * x + R[i][1] * y + R[i][2] * z + p.pos[i]; if (v < min[i]) min[i] = v; if (v > max[i]) max[i] = v; }
    }
  }
  return { min, max };
}

/** Les 8 coins (monde) d'un composant : une plaque seule → les coins de sa dalle w × h × t tournée ; plusieurs → les coins de la boîte englobante. */
export function corners(planks: Plank[], t: number): Vec3[] {
  if (planks.length === 1) {
    const p = planks[0];
    const q = new Quaternion().setFromEuler(new Euler(MathUtils.degToRad(p.rot[0]), MathUtils.degToRad(p.rot[1]), MathUtils.degToRad(p.rot[2]), 'XYZ'));
    const out: Vec3[] = [];
    for (const x of [-p.w / 2, p.w / 2]) for (const y of [-p.h / 2, p.h / 2]) for (const z of [-t / 2, t / 2]) {
      const v = new Vector3(x, y, z).applyQuaternion(q).add(new Vector3(...p.pos));
      out.push([v.x, v.y, v.z]);
    }
    return out;
  }
  const { min, max } = bounds(planks, t);
  const out: Vec3[] = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) out.push([x, y, z]);
  return out;
}

/** Les plaques du composant de plus haut niveau qui contient `id` : son groupe, ou elle seule. */
export function componentOf(s: PlankScene, id: string): Plank[] {
  const p = s.planks.find((x) => x.id === id);
  if (!p) return [];
  return p.group ? s.planks.filter((x) => x.group === p.group) : [p];
}

/** Encombrement d'un ensemble de plaques : [largeur x, profondeur z, hauteur y] en mm, arrondis. */
export function extents(planks: Plank[], t: number): [number, number, number] {
  if (!planks.length) return [0, 0, 0];
  const { min, max } = bounds(planks, t);
  return [Math.round(max[0] - min[0]), Math.round(max[2] - min[2]), Math.round(max[1] - min[1])];
}

/** Les plaques qui bougent avec `p` : celles de son groupe, et elles seules (pas de règle de contenu : l'utilisateur lie explicitement). */
export function movingWith(s: PlankScene, p: Plank): Plank[] {
  return p.group ? s.planks.filter((x) => x.group === p.group && x.id !== p.id) : [];
}

/** Applique à des plaques une rotation `qD` autour de `pivot` puis une translation `shift` (positions au centième, rotations en degrés entiers). */
export function transformPlanks(s: PlankScene, ids: Set<string>, shift: Vec3, qD: Quaternion, pivot: Vec3): PlankScene {
  const d = MathUtils.degToRad, centre = new Vector3(...pivot), sh = new Vector3(...shift);
  return {
    ...s,
    planks: s.planks.map((x) => {
      if (!ids.has(x.id)) return x;
      const np = new Vector3(...x.pos).sub(centre).applyQuaternion(qD).add(centre).add(sh);
      const qm = qD.clone().multiply(new Quaternion().setFromEuler(new Euler(d(x.rot[0]), d(x.rot[1]), d(x.rot[2]), 'XYZ')));
      const e = new Euler().setFromQuaternion(qm, 'XYZ');
      return { ...x, pos: [r2(np.x), r2(np.y), r2(np.z)] as Vec3, rot: [e.x, e.y, e.z].map((r) => Math.round(MathUtils.radToDeg(r))) as Vec3 };
    }),
  };
}

/**
 * Nouvelle position / rotation d'une plaque, répercutée sur ce qui bouge avec elle (`movingWith`) : même translation,
 * et même rotation autour du centre de la plaque déplacée (les autres tournent avec elle, comme un bloc).
 */
export function moveWithGroup(s: PlankScene, id: string, pos: Vec3, rot: Vec3): PlankScene {
  const p = s.planks.find((x) => x.id === id);
  if (!p) return s;
  const members = movingWith(s, p);
  const d = MathUtils.degToRad;
  const qOld = new Quaternion().setFromEuler(new Euler(d(p.rot[0]), d(p.rot[1]), d(p.rot[2]), 'XYZ'));
  const qNew = new Quaternion().setFromEuler(new Euler(d(rot[0]), d(rot[1]), d(rot[2]), 'XYZ'));
  const qD = qNew.clone().multiply(qOld.clone().invert());
  const shift: Vec3 = [pos[0] - p.pos[0], pos[1] - p.pos[1], pos[2] - p.pos[2]];
  const next = transformPlanks(s, new Set(members.map((x) => x.id)), shift, qD, p.pos);
  return { ...next, planks: next.planks.map((x) => (x.id === id ? { ...x, pos, rot } : x)) }; // la plaque menée prend exactement ce qu'on lui a donné
}

/** Refait les crénelages d'une plaque (après un changement d'épaisseur, par exemple) : la profondeur des crans suit `t`. */
export function recastAll(p: Plank, t: number, fit: number): Plank {
  if (!p.cast) return p;
  const edges = Object.keys(p.cast) as Edge[];
  return { ...p, notches: [...p.notches.filter((n) => !edges.includes(n.edge)), ...edges.flatMap((e) => castellation(p, e, p.cast![e]!.n, p.cast![e]!.phase, t, fit))] };
}

/** Contour d'une plaque (sens trigonométrique, centré), crans compris. Un cran qui atteint un coin entame le coin (pas de sliver). */
export function outline(p: Plank): Pt[] {
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

export interface Placed { plank: Plank; poly: Pt[]; x: number; y: number }

/** Rangement de toutes les plaques à plat sur une planche de largeur `sheet` (étagères). */
export function layout(s: PlankScene, sheet: number, gap = 6): { placed: Placed[]; height: number } {
  const items = s.planks.map((plank) => ({ plank, poly: outline(plank) })).sort((a, b) => b.plank.h - a.plank.h);
  const placed: Placed[] = [];
  let x = gap, y = gap, row = 0;
  for (const it of items) {
    if (x + it.plank.w + gap > sheet && x > gap) { x = gap; y += row + gap; row = 0; }
    placed.push({ ...it, x, y });
    x += it.plank.w + gap;
    row = Math.max(row, it.plank.h);
  }
  return { placed, height: y + row + gap };
}

const f = (n: number) => +n.toFixed(2);

/** SVG à l'échelle réelle (1 unité = 1 mm) : noir 0,1 mm = coupe, bleu = nom. */
export function planksSvg(s: PlankScene, sheet: number): string {
  const { placed, height } = layout(s, sheet);
  const parts = placed.map(({ plank, poly, x, y }) => {
    const px = (a: number) => f(x + a + plank.w / 2);
    const py = (b: number) => f(y + plank.h / 2 - b); // y du SVG vers le bas
    const holes = plank.holes.map((h) => `<polygon points="${holeOutline(h).map(([a, b]) => `${px(a)},${py(b)}`).join(' ')}" fill="none" stroke="#000" stroke-width="0.1"/>`).join('');
    return `<polygon points="${poly.map(([a, b]) => `${px(a)},${py(b)}`).join(' ')}" fill="none" stroke="#000" stroke-width="0.1"/>${holes}<text x="${f(x + plank.w / 2)}" y="${f(y + plank.h / 2)}" font-size="5" text-anchor="middle" fill="#00f" font-family="sans-serif">${plank.name}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${sheet}mm" height="${f(height)}mm" viewBox="0 0 ${sheet} ${f(height)}">${parts.join('')}</svg>`;
}

/** Une plaque seule en SVG (liste des pièces), à l'échelle `scale` px/mm, marge 4 mm. */
export function plankSvg(p: Plank, scale: number): string {
  const M = 4;
  const px = (a: number) => f((a + p.w / 2 + M) * scale), py = (b: number) => f((p.h / 2 - b + M) * scale);
  const pts = outline(p).map(([a, b]) => `${px(a)},${py(b)}`).join(' ');
  const w = f((p.w + 2 * M) * scale), h = f((p.h + 2 * M) * scale);
  const holes = p.holes.map((hl) => `<polygon points="${holeOutline(hl).map(([a, b]) => `${px(a)},${py(b)}`).join(' ')}" fill="#fff" stroke="#111" stroke-width="1"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polygon points="${pts}" fill="#f5ead8" stroke="#111" stroke-width="1"/>${holes}</svg>`;
}

// ----- découpe laser : rangement des plaques sur des planches -----

export interface NestItem { plank: Plank; poly: Pt[]; holes: Pt[][]; w: number; h: number; x: number; y: number; rotated: boolean }
export interface NestSheet { items: NestItem[]; used: number }

/** Contour et trous d'une plaque, éventuellement tournés d'un quart de tour, ramenés en (0, 0) en bas à gauche. */
function flat(p: Plank, rotated: boolean): { poly: Pt[]; holes: Pt[][]; w: number; h: number } {
  const turn = (q: Pt): Pt => (rotated ? [-q[1], q[0]] : q);
  const poly = outline(p).map(turn), holes = p.holes.map((h) => holeOutline(h).map(turn));
  const w = rotated ? p.h : p.w, hh = rotated ? p.w : p.h;
  const sh = (q: Pt): Pt => [q[0] + w / 2, q[1] + hh / 2];
  return { poly: poly.map(sh), holes: holes.map((h) => h.map(sh)), w, h: hh };
}

/**
 * Range toutes les plaques sur des planches W × H (mm), `gap` entre pièces et au bord, par rectangles libres (« MaxRects », meilleur
 * ajustement du petit côté) : les plus grandes d'abord, chaque pièce est posée, droite ou tournée d'un quart de tour, dans le rectangle
 * libre où elle laisse le moins de place perdue ; les rectangles libres sont redécoupés autour d'elle. Planche pleine → la suivante.
 * Une pièce plus grande que la planche est posée seule en (gap, gap) et signalée (`used` > 1).
 */
export function nestSheets(s: PlankScene, W: number, H: number, gap = 3): NestSheet[] {
  type Free = { x: number; y: number; w: number; h: number };
  const items = s.planks.map((p) => ({ p, area: p.w * p.h })).sort((a, b) => b.area - a.area || Math.max(b.p.w, b.p.h) - Math.max(a.p.w, a.p.h));
  const sheets: { sheet: NestSheet; free: Free[] }[] = [];
  const g = gap;
  const place = (p: Plank): boolean => {
    for (const S of sheets) {
      let best: { f: Free; rotated: boolean; score: number } | null = null;
      for (const f of S.free) for (const rotated of [false, true]) {
        const w = (rotated ? p.h : p.w) + g, h = (rotated ? p.w : p.h) + g; // la pièce et son espace
        if (w > f.w || h > f.h) continue;
        const score = Math.min(f.w - w, f.h - h) * 10000 + Math.max(f.w - w, f.h - h); // petit côté restant le plus faible
        if (!best || score < best.score) best = { f, rotated, score };
      }
      if (!best) continue;
      const { f, rotated } = best;
      const w = (rotated ? p.h : p.w) + g, h = (rotated ? p.w : p.h) + g;
      const it: NestItem = { plank: p, rotated, ...flat(p, rotated), x: f.x, y: f.y };
      S.sheet.items.push(it);
      S.sheet.used = Math.max(S.sheet.used, (f.y + h) / H);
      // redécoupe : chaque rectangle libre qui touche la pièce est remplacé par ses restes (haut, bas, gauche, droite)
      const used = { x: f.x, y: f.y, w, h };
      const next: Free[] = [];
      for (const r of S.free) {
        if (used.x >= r.x + r.w || used.x + used.w <= r.x || used.y >= r.y + r.h || used.y + used.h <= r.y) { next.push(r); continue; }
        if (used.x > r.x) next.push({ x: r.x, y: r.y, w: used.x - r.x, h: r.h });
        if (used.x + used.w < r.x + r.w) next.push({ x: used.x + used.w, y: r.y, w: r.x + r.w - used.x - used.w, h: r.h });
        if (used.y > r.y) next.push({ x: r.x, y: r.y, w: r.w, h: used.y - r.y });
        if (used.y + used.h < r.y + r.h) next.push({ x: r.x, y: used.y + used.h, w: r.w, h: r.y + r.h - used.y - used.h });
      }
      // on enlève les rectangles contenus dans un autre
      S.free = next.filter((a, k) => a.w > 0.5 && a.h > 0.5 && !next.some((b, l) => l !== k && b.x <= a.x && b.y <= a.y && b.x + b.w >= a.x + a.w && b.y + b.h >= a.y + a.h && (b.w > a.w || b.h > a.h || l < k)));
      return true;
    }
    return false;
  };
  for (const { p } of items) {
    if (place(p)) continue;
    sheets.push({ sheet: { items: [], used: 0 }, free: [{ x: g, y: g, w: W - g, h: H - g }] });
    if (!place(p)) { // plus grande que la planche : posée seule, signalée
      const S = sheets[sheets.length - 1];
      const it: NestItem = { plank: p, rotated: false, ...flat(p, false), x: g, y: g };
      S.sheet.items.push(it);
      S.sheet.used = Math.max(1.01, (g + p.h + g) / H);
      S.free = [];
    }
  }
  return sheets.map((S) => S.sheet);
}

/** SVG d'une planche pour la machine : cadre de la planche en gris (repère, à ne pas couper), noir 0,1 mm = coupe, bleu = nom à graver. 1 unité = 1 mm, origine en haut à gauche. */
export function sheetSvg(sheet: NestSheet, W: number, H: number, index: number): string {
  const f = (n: number) => +n.toFixed(2);
  const parts = sheet.items.map(({ plank, poly, holes, x, y, h }) => {
    const px = (a: number) => f(x + a), py = (b: number) => f(y + h - b); // y vers le bas
    const pg = (pts: Pt[]) => `<polygon points="${pts.map(([a, b]) => `${px(a)},${py(b)}`).join(' ')}" fill="none" stroke="#000" stroke-width="0.1"/>`;
    return pg(poly) + holes.map(pg).join('') + `<text x="${f(x + 4)}" y="${f(y + 6)}" font-size="4" fill="#00f" font-family="sans-serif">${plank.name}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}"><rect x="0.05" y="0.05" width="${W - 0.1}" height="${H - 0.1}" fill="none" stroke="#bbb" stroke-width="0.1" stroke-dasharray="2 2"/><text x="${W - 3}" y="${H - 3}" font-size="4" text-anchor="end" fill="#999" font-family="sans-serif">planche ${index + 1}</text>${parts.join('')}</svg>`;
}

/** Aperçu : toutes les planches empilées, avec un fond clair pour chacune. */
export function sheetsPreviewSvg(sheets: NestSheet[], W: number, H: number, gap = 12): string {
  const total = sheets.length * (H + gap) - gap;
  const inner = sheets.map((sh, i) => `<g transform="translate(0 ${i * (H + gap)})"><rect width="${W}" height="${H}" fill="#fffdf7" stroke="#d6d3d1" stroke-width="0.3"/>${sheetSvg(sh, W, H, i).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${total}mm" viewBox="0 0 ${W} ${total}"><style>polygon{stroke-width:0.6}text{font-size:6px}</style>${inner}</svg>`; // traits épaissis pour l'écran seulement
}
