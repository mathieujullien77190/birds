/**
 * Plaques de bois : des rectangles d'une épaisseur commune, posés librement dans l'espace, avec des crans (encoches
 * rectangulaires) sur leurs bords pour s'emboîter. Tout en millimètres. Repère d'une plaque : x = largeur, y = hauteur,
 * centrée sur son milieu ; l'épaisseur est le long de z, centrée aussi.
 * **Monde : Z = hauteur** (X = largeur, Y = profondeur, +y = arrière, sol = plan XY), comme la visionneuse STL.
 */
import { Euler, MathUtils, Matrix4, Quaternion, Vector3 } from 'three';

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
  next.x = r2(Math.min(Math.max(h.x, -p.w / 2 + M + hw), p.w / 2 - M - hw)); // au centième : les fentes des dents doivent tomber juste
  next.y = r2(Math.min(Math.max(h.y, -p.h / 2 + M + hh), p.h / 2 - M - hh));
  return next;
}

export interface Plank {
  id: string;
  /** Élément spécial (pas du bois) : dessiné par son propre modèle 3D, exclu de la découpe laser. « camera » (carte caméra) ou « ir » (carte de LED infrarouges). */
  /** Contour libre (repère de la plaque, sens trigonométrique) : remplace le rectangle (crans et trous restent possibles). */
  poly?: [number, number][];
  /** Pavé à contour en plan : le haut est un plan incliné z = z0 + bx · x + by · y (repère de la plaque, z relatif au centre). */
  top?: { z0: number; bx: number; by: number };
  special?: 'camera' | 'ir' | 'bar' | 'pi' | 'cable' | 'wire' | 'case' | 'block' | 'heatsink' | 'sensor' | 'fan' | 'peltier' | 'driver' | 'alu' | 'solar' | 'doc' | 'conduit';
  /** « block » (pavé) : épaisseur réelle du pavé selon z, au lieu de l'épaisseur du bois. */
  depth?: number;
  /** « wire » : couleur du fil (CSS). */
  color?: string;
  /** « cable » : chemin de la nappe (points, dans le repère local de la plaque, posée en pos = 0) ; w = largeur de la nappe. */
  path?: Vec3[];
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
  /** Lien vers la fiche du composant (site de référence ou revendeur) : affiché dans « Pièces ». */
  url?: string;
}

export interface PlankScene { t: number; fit: number; planks: Plank[]; /** Nom des groupes (boîtes…) par identifiant. */ groupNames?: Record<string, string>; /** 'z2' : scène en Z = hauteur. (Vide : ancienne scène Y = hauteur ; 'z' / 'z1' : converties par des versions intermédiaires fautives ; toutes réparées au chargement.) */ up?: 'z' | 'z1' | 'z2' }

export const uid = (): string => Math.random().toString(36).slice(2, 9);

export const newPlank = (n: number, w = 120, h = 80): Plank => ({ id: uid(), name: `Plaque ${n}`, w, h, pos: [(n - 1) * 40, 0, h / 2], rot: [90, 0, 0], notches: [], holes: [] }); // debout, face à l'avant (−y)

/** Rotation (degrés XYZ) qui envoie l'axe x local sur `bx` et l'axe y local sur `by` (base directe : z = x × y). */
export function rotFromBasis(bx: Vec3, by: Vec3): Vec3 {
  const x = new Vector3(...bx), y = new Vector3(...by), z = x.clone().cross(y);
  const e = new Euler().setFromRotationMatrix(new Matrix4().makeBasis(x, y, z), 'XYZ');
  return [e.x, e.y, e.z].map((r) => Math.round(MathUtils.radToDeg(r))) as Vec3;
}

/** Conversion d'une scène Y = hauteur (ancien repère) vers Z = hauteur : (x, y, z) → (x, −z, y), rotations composées avec Rx(+90°) (le monde entier tourne). */
export function toZUp(s: PlankScene): PlankScene {
  if (s.up === 'z2') return s;
  const qM = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2), qMi = qM.clone().invert();
  const d = MathUtils.degToRad;
  return {
    ...s,
    up: 'z2',
    planks: s.planks.map((p) => {
      const qc = new Quaternion().setFromEuler(new Euler(d(p.rot[0]), d(p.rot[1]), d(p.rot[2]), 'XYZ'));
      // bonne formule : R = Rx(90) · R_ancien. 'z' avait fait R_conj = Rx(90)·R·Rx(−90) → R = R_conj·Rx(90) ; 'z1' avait fait Rx(90)·R_conj → R = Rx(−90)·R_z1·Rx(90)
      const q = s.up === 'z' ? qc.clone().multiply(qM) : s.up === 'z1' ? qMi.clone().multiply(qc).multiply(qM) : qM.clone().multiply(qc);
      const e = new Euler().setFromQuaternion(q, 'XYZ');
      return { ...p, pos: s.up ? p.pos : ([p.pos[0], -p.pos[2], p.pos[1]] as Vec3), rot: [e.x, e.y, e.z].map((r) => Math.round(MathUtils.radToDeg(r))) as Vec3 };
    }),
  };
}
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

export const DEFAULT_SCENE: PlankScene = { t: 3, fit: 0, planks: [], up: 'z2' }; // jeu 0 : crans ajustés exactement (le laser enlève déjà ~0,1 mm, ce qui donne le jeu)

const KEY = 'plaques-scene';
export function loadScene(): PlankScene {
  try { const s = JSON.parse(localStorage.getItem(KEY) ?? '') as PlankScene; if (s && Array.isArray(s.planks)) return toZUp({ ...s, fit: 0, planks: s.planks.map((p) => ({ ...p, notches: p.notches ?? [], holes: p.holes ?? [] })) }); } catch { /* rien */ } // fit : toujours 0 (le réglage n'existe plus) ; anciennes scènes converties en Z = hauteur
  return DEFAULT_SCENE;
}
export function saveScene(s: PlankScene): void { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* quota */ } }

/** Historique de « Retour », gardé aussi au rechargement, sans limite (si le navigateur refuse par manque de place, on lâche la moitié la plus ancienne et on réessaie). */
export interface HistoryEntry { label: string; scene: PlankScene; at: number }
const HKEY = 'plaques-historique';
export function loadHistory(): HistoryEntry[] {
  try { const h = JSON.parse(localStorage.getItem(HKEY) ?? '') as HistoryEntry[]; if (Array.isArray(h)) return h.map((e) => ({ ...e, scene: toZUp(e.scene) })); } catch { /* rien */ }
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

/** Taille de base d'une dent, en mm (boîtes et « Dents : auto »). */
export const TOOTH = 16;

/** Nombre impair de dents pour un bord de longueur `len` (une dent ≈ TOOTH mm, 3 au moins) : la dent réelle = len / n, au plus près de 16 mm. */
export const teethFor = (len: number): number => { const n = Math.max(3, Math.round(len / TOOTH)); return n % 2 ? n : n + 1; };

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
  const z = H / 2, k = start, group = uid(); // les six plaques sont liées : la boîte bouge d'un bloc
  const wall = rotFromBasis([1, 0, 0], [0, 0, 1]); // plaque debout face à l'avant : x → x, hauteur → z
  const side = rotFromBasis([0, 1, 0], [0, 0, 1]); // plaque debout de côté : x → y (profondeur), hauteur → z
  const planks = [
    mk(`Face avant ${k}`, l, H, [0, -L / 2 + t / 2, z], wall, { top: { n: nl, phase: 0 }, bottom: { n: nl, phase: 0 }, left: { n: nH, phase: 0 }, right: { n: nH, phase: 0 } }),
    mk(`Face arrière ${k}`, l, H, [0, L / 2 - t / 2, z], wall, { top: { n: nl, phase: 0 }, bottom: { n: nl, phase: 0 }, left: { n: nH, phase: 0 }, right: { n: nH, phase: 0 } }),
    mk(`Côté droit ${k}`, L, H, [l / 2 - t / 2, 0, z], side, { top: { n: nL, phase: 0 }, bottom: { n: nL, phase: 0 }, left: { n: nH, phase: 1 }, right: { n: nH, phase: 1 } }),
    mk(`Côté gauche ${k}`, L, H, [-l / 2 + t / 2, 0, z], side, { top: { n: nL, phase: 0 }, bottom: { n: nL, phase: 0 }, left: { n: nH, phase: 1 }, right: { n: nH, phase: 1 } }),
    mk(`Dessus ${k}`, l, L, [0, 0, H - t / 2], [0, 0, 0], { top: { n: nl, phase: 1 }, bottom: { n: nl, phase: 1 }, left: { n: nL, phase: 1 }, right: { n: nL, phase: 1 } }),
    mk(`Dessous ${k}`, l, L, [0, 0, t / 2], [0, 0, 0], { top: { n: nl, phase: 1 }, bottom: { n: nl, phase: 1 }, left: { n: nL, phase: 1 }, right: { n: nL, phase: 1 } }),
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
    for (const x of [-p.w / 2, p.w / 2]) for (const y of [-p.h / 2, p.h / 2]) for (const z of [-(p.depth ?? t) / 2, (p.depth ?? t) / 2]) {
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
    for (const x of [-p.w / 2, p.w / 2]) for (const y of [-p.h / 2, p.h / 2]) for (const z of [-(p.depth ?? t) / 2, (p.depth ?? t) / 2]) {
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

/** Encombrement d'un ensemble de plaques : [largeur x, profondeur y, hauteur z] en mm, arrondis. */
export function extents(planks: Plank[], t: number): [number, number, number] {
  if (!planks.length) return [0, 0, 0];
  const { min, max } = bounds(planks, t);
  return [Math.round(max[0] - min[0]), Math.round(max[1] - min[1]), Math.round(max[2] - min[2])];
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

/** Comme `flat` mais pour `k` quarts de tour (0 à 3). */
function flatK(p: Plank, k: number): { poly: Pt[]; holes: Pt[][]; w: number; h: number } {
  const turn = (q: Pt): Pt => { let [x, y] = q; for (let i = 0; i < k; i++) [x, y] = [-y, x]; return [x, y]; };
  const poly = outline(p).map(turn), holes = p.holes.map((hh) => holeOutline(hh).map(turn));
  const w = k % 2 ? p.h : p.w, hh = k % 2 ? p.w : p.h;
  const sh = (q: Pt): Pt => [q[0] + w / 2, q[1] + hh / 2];
  return { poly: poly.map(sh), holes: holes.map((h) => h.map(sh)), w, h: hh };
}

/**
 * Poches vides d'une pièce (les creux d'un U, les grands trous) : rectangles libres à l'intérieur de son encombrement où l'on peut ranger d'autres pièces.
 * On quadrille l'encombrement (2 mm), on marque la matière (dans le contour, hors des trous), puis on prend à plusieurs reprises le plus grand rectangle vide
 * (méthode de l'histogramme) tant qu'il fait au moins `min` mm de côté. Coordonnées de la pièce (origine en bas à gauche).
 */
function pockets(poly: Pt[], holes: Pt[][], w: number, h: number, min = 28, res = 2): [number, number, number, number][] {
  const nx = Math.ceil(w / res), ny = Math.ceil(h / res);
  const inside = (pts: Pt[], x: number, y: number) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const occ = new Uint8Array(nx * ny); // 1 = matière
  for (let ix = 0; ix < nx; ix++) for (let iy = 0; iy < ny; iy++) {
    const x = (ix + 0.5) * res, y = (iy + 0.5) * res;
    if (inside(poly, x, y) && !holes.some((hh) => inside(hh, x, y))) occ[ix * ny + iy] = 1;
  }
  return emptyRects(occ, nx, ny, res, min, 8);
}

/** Plus grands rectangles vides d'une grille d'occupation (indice ix * ny + iy, 1 = pris), pris un à un (histogramme) : [x0, y0, x1, y1] en mm. La grille est modifiée. */
function emptyRects(occ: Uint8Array, nx: number, ny: number, res: number, min: number, rounds: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (let round = 0; round < rounds; round++) {
    let best = { area: 0, x0: 0, y0: 0, x1: 0, y1: 0 };
    const hist = new Int32Array(nx);
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) hist[ix] = occ[ix * ny + iy] ? 0 : hist[ix] + 1;
      const st: number[] = [];
      for (let ix = 0; ix <= nx; ix++) {
        const cur = ix === nx ? 0 : hist[ix];
        while (st.length && hist[st[st.length - 1]] >= cur) {
          const hh = hist[st.pop()!], left = st.length ? st[st.length - 1] + 1 : 0, width = ix - left;
          if (hh * width > best.area) best = { area: hh * width, x0: left, x1: ix, y0: iy - hh + 1, y1: iy + 1 };
        }
        st.push(ix);
      }
    }
    if ((best.x1 - best.x0) * res < min || (best.y1 - best.y0) * res < min) break;
    out.push([best.x0 * res, best.y0 * res, best.x1 * res, best.y1 * res]);
    for (let ix = best.x0; ix < best.x1; ix++) for (let iy = best.y0; iy < best.y1; iy++) occ[ix * ny + iy] = 1;
  }
  return out;
}

/**
 * Range toutes les plaques sur des planches W × H (mm), `gap` entre pièces et au bord, par rectangles libres (« MaxRects », meilleur
 * ajustement du petit côté) : les plus grandes d'abord, chaque pièce est posée, droite ou tournée d'un quart de tour, dans le rectangle
 * libre où elle laisse le moins de place perdue ; les rectangles libres sont redécoupés autour d'elle. Planche pleine → la suivante.
 * Une pièce plus grande que la planche est posée seule en (gap, gap) et signalée (`used` > 1).
 */
export function nestSheets(s: PlankScene, W: number, H: number, gap = 5, margin = 8): NestSheet[] { // gap = espace entre pièces, margin = marge sur les bords de la planche
  type Free = { x: number; y: number; w: number; h: number };
  const items = s.planks.filter((p) => !p.special).map((p) => ({ p, area: p.w * p.h })).sort((a, b) => b.area - a.area || Math.max(b.p.w, b.p.h) - Math.max(a.p.w, a.p.h));
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
      // les creux de la pièce (U, grands trous) deviennent de nouveaux rectangles libres : on y range d'autres pièces (à `gap` de la matière)
      if (it.w * it.h > 5000) for (const [qx0, qy0, qx1, qy1] of pockets(it.poly, it.holes, it.w, it.h)) {
        const sx = it.x + qx0, sy = it.y + it.h - qy1; // repère de la planche (y vers le bas)
        next.push({ x: sx + g, y: sy + g, w: qx1 - qx0 - g, h: qy1 - qy0 - g });
      }
      // on enlève les rectangles contenus dans un autre
      S.free = next.filter((a, k) => a.w > 0.5 && a.h > 0.5 && !next.some((b, l) => l !== k && b.x <= a.x && b.y <= a.y && b.x + b.w >= a.x + a.w && b.y + b.h >= a.y + a.h && (b.w > a.w || b.h > a.h || l < k)));
      return true;
    }
    return false;
  };
  // pièces à creux (U, grands trous) : rangées d'abord par collision de grilles (4 mm) en les tournant de 0 / 90 / 180 / 270° : elles s'emboîtent les unes dans les autres,
  // puis les creux restants de la planche servent de rectangles libres aux pièces simples
  const RES = 4;
  const rsheets = new Map<NestSheet, { occ: Uint8Array; nx: number; ny: number }>();
  const hollow = items.filter(({ p }) => p.w * p.h >= 15000 && p.w + 2 * g <= W && p.h + 2 * g <= H && (() => { const f = flat(p, false); return pockets(f.poly, f.holes, f.w, f.h).length > 0; })());
  const doneSet = new Set<Plank>();
  const occOf = (poly: Pt[], holes: Pt[][], w: number, h: number) => { // grille de la pièce dans le repère de la planche (y vers le bas), matière dilatée d'une cellule (≥ gap), 1 cellule de marge autour
    const nx = Math.ceil(w / RES) + 2, ny = Math.ceil(h / RES) + 2, cells = new Uint8Array(nx * ny);
    const inside = (pts: Pt[], x: number, y: number) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
    const raw = new Uint8Array(nx * ny);
    for (let ix = 1; ix < nx - 1; ix++) for (let iy = 1; iy < ny - 1; iy++) {
      const x = (ix - 1 + 0.5) * RES, yb = h - (iy - 1 + 0.5) * RES; // y vers le haut dans le contour
      let on = false;
      for (const [dx, dy] of [[0, 0], [-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) if (inside(poly, x + dx, yb + dy) && !holes.some((hh) => inside(hh, x + dx, yb + dy))) { on = true; break; }
      if (on) raw[ix * ny + iy] = 1;
    }
    for (let ix = 0; ix < nx; ix++) for (let iy = 0; iy < ny; iy++) if (raw[ix * ny + iy]) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const jx = ix + a, jy = iy + b; if (jx >= 0 && jx < nx && jy >= 0 && jy < ny) cells[jx * ny + jy] = 1; }
    return { nx, ny, cells };
  };
  const NXS = Math.ceil(W / RES), NYS = Math.ceil(H / RES);
  const fitAt = (R: { occ: Uint8Array }, pc: { nx: number; ny: number; cells: Uint8Array }) => { // première position (rangée par rangée) sans collision
    const c0 = Math.max(0, Math.ceil(margin / RES) - 1); // marge sur les bords de la planche aussi pour la phase de rangement serré
    for (let cy = c0; cy + pc.ny <= NYS - c0; cy++) for (let cx = c0; cx + pc.nx <= NXS - c0; cx++) {
      let hit = false;
      for (let ix = 0; ix < pc.nx && !hit; ix++) for (let iy = 0; iy < pc.ny; iy++) if (pc.cells[ix * pc.ny + iy] && R.occ[(cx + ix) * NYS + cy + iy]) { hit = true; break; }
      if (!hit) return { cx, cy };
    }
    return null;
  };
  for (const { p } of hollow) {
    let best: { R: { occ: Uint8Array; nx: number; ny: number }; S: NestSheet; k: number; cx: number; cy: number; pc: ReturnType<typeof occOf>; f: ReturnType<typeof flatK>; score: number } | null = null;
    const tryOn = (S: NestSheet, R: { occ: Uint8Array; nx: number; ny: number }) => {
      for (let k = 0; k < 4; k++) {
        const f = flatK(p, k), pc = occOf(f.poly, f.holes, f.w, f.h), pos = fitAt(R, pc);
        if (!pos) continue;
        const score = (pos.cy + pc.ny) * 1000 + pos.cx + k * 0.01; // le plus haut possible, puis le plus à gauche
        if (!best || score < best.score) best = { R, S, k, cx: pos.cx, cy: pos.cy, pc, f, score };
      }
    };
    for (const [S, R] of rsheets) { tryOn(S, R); if (best) break; }
    if (!best) {
      const S: NestSheet = { items: [], used: 0 }, R = { occ: new Uint8Array(NXS * NYS), nx: NXS, ny: NYS };
      sheets.push({ sheet: S, free: [] }); rsheets.set(S, R);
      tryOn(S, R);
    }
    if (!best) continue; // ne rentre pas : traitée comme une pièce simple
    const b = best as { R: { occ: Uint8Array }; S: NestSheet; k: number; cx: number; cy: number; pc: ReturnType<typeof occOf>; f: ReturnType<typeof flatK> };
    const x = (b.cx + 1) * RES, y = (b.cy + 1) * RES; // la grille de la pièce a 1 cellule de marge
    b.S.items.push({ plank: p, rotated: b.k % 2 === 1, poly: b.f.poly, holes: b.f.holes, w: b.f.w, h: b.f.h, x, y });
    b.S.used = Math.max(b.S.used, (y + b.f.h) / H);
    for (let ix = 0; ix < b.pc.nx; ix++) for (let iy = 0; iy < b.pc.ny; iy++) if (b.pc.cells[ix * b.pc.ny + iy]) b.R.occ[(b.cx + ix) * NYS + b.cy + iy] = 1;
    doneSet.add(p);
  }
  for (const [S, R] of rsheets) { // les creux restants de ces planches deviennent des rectangles libres
    const sheetOcc = R.occ.slice(), free: Free[] = [];
    for (const [x0, y0, x1, y1] of emptyRects(sheetOcc, NXS, NYS, RES, 16, 40)) { const fx = Math.max(x0, margin), fy = Math.max(y0, margin), fw = Math.min(x1, W - margin + g) - fx, fh = Math.min(y1, H - margin + g) - fy; if (fw > 0 && fh > 0) free.push({ x: fx, y: fy, w: fw, h: fh }); } // les creux aussi respectent la marge
    const slot = sheets.find((s) => s.sheet === S);
    if (slot) slot.free = free;
  }
  for (const { p } of items) {
    if (doneSet.has(p)) continue;
    if (place(p)) continue;
    sheets.push({ sheet: { items: [], used: 0 }, free: [{ x: margin, y: margin, w: W - 2 * margin + g, h: H - 2 * margin + g }] }); // la place libre commence à la marge ; une pièce occupe (taille + g), d'où le + g
    if (!place(p)) { // plus grande que la planche : posée seule, signalée
      const S = sheets[sheets.length - 1];
      const it: NestItem = { plank: p, rotated: false, ...flat(p, false), x: margin, y: margin };
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

// ----- tirer une face : la plaque et tout ce qui lui est connecté suivent -----

export type FaceAxis = 'x' | 'y' | 'z';

/** Axes locaux d'une plaque, en coordonnées monde. */
function axesOf(p: Plank): { x: Vector3; y: Vector3; z: Vector3 } {
  const d = MathUtils.degToRad;
  const q = new Quaternion().setFromEuler(new Euler(d(p.rot[0]), d(p.rot[1]), d(p.rot[2]), 'XYZ'));
  return { x: new Vector3(1, 0, 0).applyQuaternion(q), y: new Vector3(0, 1, 0).applyQuaternion(q), z: new Vector3(0, 0, 1).applyQuaternion(q) };
}

/**
 * Tire (d > 0) ou pousse (d < 0) la face `axis` × `sign` de la plaque `id` de `d` mm le long de sa normale N.
 * Les plaques du même groupe connectées à cette face, de proche en proche (elles se touchent et affleurent le plan de la face),
 * suivent : celles dont la normale est N se déplacent, celles qui sont perpendiculaires s'allongent ou se raccourcissent
 * (leur bord opposé reste en place), minimum 1 mm ; leurs crénelages sont refaits. Renvoie la scène et le `d` réellement appliqué.
 */
export function pullFace(s: PlankScene, id: string, axis: FaceAxis, sign: 1 | -1, d: number): { scene: PlankScene; applied: number } {
  const p = s.planks.find((x) => x.id === id);
  if (!p || !d) return { scene: s, applied: 0 };
  const ax = axesOf(p);
  const N = ax[axis].clone().multiplyScalar(sign);
  const half = axis === 'x' ? p.w / 2 : axis === 'y' ? p.h / 2 : s.t / 2;
  const facePos = new Vector3(...p.pos).dot(N) + half; // position du plan de la face le long de N
  const tol = s.t + 1;
  const proj = (x: Plank) => corners([x], s.t).map((c) => new Vector3(...c).dot(N));
  const touchesPlane = (x: Plank) => Math.abs(Math.max(...proj(x)) - facePos) < tol || Math.abs(Math.min(...proj(x)) - facePos) < tol;
  const bb = new Map<string, { min: Vec3; max: Vec3 }>();
  const boxOf = (x: Plank) => { let b = bb.get(x.id); if (!b) { b = bounds([x], s.t); bb.set(x.id, b); } return b; };
  const touch = (a: Plank, b: Plank) => { const A = boxOf(a), B = boxOf(b); return [0, 1, 2].every((i) => A.min[i] - tol <= B.max[i] && B.min[i] - tol <= A.max[i]); };
  // fermeture : tout ce qui touche l'ensemble et affleure le plan de la face
  const members = p.group ? s.planks.filter((x) => x.group === p.group && x.id !== id) : [];
  const set = new Map<string, Plank>([[p.id, p]]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const m of members) if (!set.has(m.id) && touchesPlane(m) && [...set.values()].some((q) => touch(m, q))) { set.set(m.id, m); grew = true; }
  }
  // quoi faire pour chacun : déplacer (normale ∥ N) ou allonger (un axe du plan ∥ N)
  const plan = new Map<string, { kind: 'move' } | { kind: 'resize'; axis: 'w' | 'h' }>();
  for (const x of set.values()) {
    if (x.id === p.id && axis !== 'z') { plan.set(x.id, { kind: 'resize', axis: axis === 'x' ? 'w' : 'h' }); continue; }
    const a = axesOf(x);
    if (Math.abs(a.z.dot(N)) > 0.9) plan.set(x.id, { kind: 'move' });
    else if (Math.abs(a.x.dot(N)) > 0.9) plan.set(x.id, { kind: 'resize', axis: 'w' });
    else if (Math.abs(a.y.dot(N)) > 0.9) plan.set(x.id, { kind: 'resize', axis: 'h' });
    else plan.set(x.id, { kind: 'move' });
  }
  // minimum 1 mm sur tout ce qui se raccourcit
  let applied = d;
  for (const [pid, what] of plan) if (what.kind === 'resize') { const x = set.get(pid)!; const size = what.axis === 'w' ? x.w : x.h; if (size + applied < 1) applied = 1 - size; }
  if (Math.abs(applied) < 1e-6) return { scene: s, applied: 0 };
  const scene: PlankScene = {
    ...s,
    planks: s.planks.map((x) => {
      const what = plan.get(x.id);
      if (!what) return x;
      if (what.kind === 'move') { const np = new Vector3(...x.pos).addScaledVector(N, applied); return { ...x, pos: [r2(np.x), r2(np.y), r2(np.z)] as Vec3 }; }
      const np = new Vector3(...x.pos).addScaledVector(N, applied / 2); // le bord opposé ne bouge pas
      const nx: Plank = { ...x, pos: [r2(np.x), r2(np.y), r2(np.z)] as Vec3, [what.axis]: +((what.axis === 'w' ? x.w : x.h) + applied).toFixed(2) };
      return recastAll(nx, s.t, s.fit);
    }),
  };
  return { scene, applied };
}

/**
 * Bouton magique : perce, dans la plaque `id`, les fentes où d'autres plaques la traversent.
 * Pour chaque autre plaque A perpendiculaire (hors de son groupe), le plan médian de la plaque coupe A selon une droite ;
 * les morceaux de matière de A sur cette droite (les dents, pas les crans) donnent des fentes rectangulaires :
 * longueur de la dent × épaisseur du bois (+ jeu `fit`). Les fentes déjà présentes ne sont pas doublées.
 * Renvoie la scène et le nombre de fentes ajoutées (axes de la plaque seulement : les dents en diagonale sont ignorées).
 */
export function slotsForTeeth(s: PlankScene, id: string): { scene: PlankScene; added: number; planks: number } {
  const B = s.planks.find((p) => p.id === id);
  if (!B) return { scene: s, added: 0, planks: 0 };
  const bx = axesOf(B), nB = bx.z, posB = new Vector3(...B.pos);
  const fresh: Hole[] = [];
  const sources = new Set<string>();
  for (const A of s.planks) {
    if (A.id === B.id || (A.group && A.group === B.group)) continue;
    const ax = axesOf(A);
    if (Math.abs(nB.dot(ax.z)) > 0.1) continue; // A doit être perpendiculaire à B
    const a = nB.dot(ax.x), b = nB.dot(ax.y), c = nB.dot(new Vector3(...A.pos).sub(posB));
    const n2 = a * a + b * b;
    if (n2 < 0.5) continue;
    const norm = Math.sqrt(n2), p0: Pt = [-c * a / n2, -c * b / n2], dir: Pt = [-b / norm, a / norm];
    // intersections du contour de A avec la droite (plan médian de B) p0 + s·dir
    const poly = outline(A), ss: number[] = [];
    for (let i = 0; i < poly.length; i++) {
      const P = poly[i], Q = poly[(i + 1) % poly.length];
      const dP = a * P[0] + b * P[1] + c, dQ = a * Q[0] + b * Q[1] + c;
      if ((dP > 0) === (dQ > 0)) continue;
      const k = dP / (dP - dQ);
      ss.push((P[0] + (Q[0] - P[0]) * k - p0[0]) * dir[0] + (P[1] + (Q[1] - P[1]) * k - p0[1]) * dir[1]);
    }
    ss.sort((u, v) => u - v);
    const posA = new Vector3(...A.pos);
    const toB = (sv: number): [number, number] => {
      const w = new Vector3().addScaledVector(ax.x, p0[0] + dir[0] * sv).addScaledVector(ax.y, p0[1] + dir[1] * sv).add(posA).sub(posB);
      return [w.dot(bx.x), w.dot(bx.y)];
    };
    const nLoc: [number, number] = [ax.z.dot(bx.x), ax.z.dot(bx.y)]; // épaisseur de A vue dans le plan de B
    for (let i = 0; i + 1 < ss.length; i += 2) {
      if (ss[i + 1] - ss[i] < 0.5) continue;
      const [x0, y0] = toB(ss[i]), [x1, y1] = toB(ss[i + 1]);
      const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
      if (dx > 0.05 && dy > 0.05) continue; // diagonale : non géré
      const cx = r2((x0 + x1) / 2), cy = r2((y0 + y1) / 2);
      if (Math.abs(cx) > B.w / 2 || Math.abs(cy) > B.h / 2) continue; // la dent n'arrive pas dans B
      const size = r2(dx + s.t * Math.abs(nLoc[0]) + s.fit), sh = r2(dy + s.t * Math.abs(nLoc[1]) + s.fit);
      if ([...B.holes, ...fresh].some((h) => h.shape === 'square' && Math.abs(h.x - cx) < 0.6 && Math.abs(h.y - cy) < 0.6 && Math.abs(h.size - size) < 0.6 && Math.abs((h.sh ?? h.size) - sh) < 0.6)) continue;
      fresh.push(fitHole(B, { id: uid(), shape: 'square', x: cx, y: cy, size, sh }));
      sources.add(A.id);
    }
  }
  if (!fresh.length) return { scene: s, added: 0, planks: 0 };
  return { scene: { ...s, planks: s.planks.map((p) => (p.id === B.id ? { ...p, holes: [...p.holes, ...fresh] } : p)) }, added: fresh.length, planks: sources.size };
}

/** Réglages d'un nichoir à double paroi (mm) : intérieur utile l × L, hauteur du sol au bas du trou, trou, hauteur au-dessus du trou, épaisseur d'isolant. */
export interface NestParams { l: number; L: number; floorToHole: number; hole: number; above: number; ins: number; /** côté intérieur du compartiment caméra dans l'isolant du toit (0 = aucun) */ cam: number; /** deuxième caméra dans une mini boîte en contreplaqué, sous le toit à gauche, tournée vers le trou d'entrée ; longue nappe jusqu'au 2ᵉ port caméra du Pi */ cam2: boolean; /** système solaire : panneau de 100 W sur poteaux, déporté ; batterie, régulateur et pont en H dans le toit */ solar: boolean; /** lambris : une couche de lames verticales sur les quatre côtés du corps */ chene: boolean; /** planche de chêne de 18 mm posée sur le toit, qui déborde de 15 mm */ lambris: boolean; /** toit en pente (deux pans en diagonale sur les côtés, au-dessus du toit plat) */ pente: boolean; /** module Peltier + radiateur alu sur la moitié haute du mur arrière + capteur de température / humidité */ clim: boolean }
export const NEST_DEFAULT: NestParams = { l: 120, L: 120, floorToHole: 130, hole: 28, above: 20, ins: 39, cam: 38, chene: false, lambris: true, pente: true, clim: true, solar: true, cam2: true }; // lambris et toit en pente : retirés pour le moment (cases « Lambris » et « Toit en pente » pour les remettre)

/** Module Peltier (TEC1-12706 : 40 × 40 × 3,8) : plaque froide alu 60 × 60 × 3 dans le nid, bloc alu 40 × 40 qui traverse l'isolant, Peltier, radiateur alu 60 × 60 à ailettes à l'extérieur. Hauteur du centre (z) sur le mur arrière. */
export const CLIM_Z = 170, TEC = 40, TEC_T = 3.8;
/** Système Peltier dans le toit, derrière le compartiment caméra : position y du centre du Peltier, et du compartiment caméra (décalé un peu vers l'avant, côté trou d'entrée). */
export const TEC_Y = 40, CAM_Y = -10, COLD = 60;
/** Compartiment du Peltier dans le toit (comme celui de la caméra) : sans isolant, ouvert au-dessus ; le dissipateur de 40 est dedans avec de l'air autour. */
/** Évacuation de l'eau de condensation : gouttère en diagonale sous la plaque froide (au fond du nid, en haut), trou dans les deux murs arrière, pile de carrés de bois percés qui traverse l'isolant. */
export const DRAIN_X = 50, DRAIN_Y = 50, DRAIN_S = 16, DRAIN_HOLE = 4; // trou d'évacuation dans le coin arrière droit, percé VERS LE BAS à travers le fond : Ø 4
export const TILT_DEG = 5; // inclinaison du bloc plaque froide + Peltier + dissipateur vers l'arrière
export const TECW = 70, TECD = 70, TEC_CX = 8, TEC_CY = 51; // largeur réduite à 70 (et recentrée) pour laisser 1 cm de chaque côté de la batterie // intérieur du compartiment du dissipateur (40) : réduit (2,5 cm d'air autour en x, un peu moins en y), décalé vers la droite pour laisser le coin arrière gauche au Raspberry Pi
/** Grande plaque froide en alu sous le plafond du nid : largeur (x), profondeur (y) et centre en y. */
export const COLD_W = 116, COLD_D = 43, COLD_Y = 38.5; // derrière le compartiment caméra (jusqu'à y = 17) et jusqu'au mur arrière (y = 60) : la caméra n'est PAS dans la plaque // COLD : côté de l'ancienne plaque froide (encore utilisé par le lambris)
/** Capteur température / humidité (carte type BME280 / DHT22, 15 × 11) fixé à l'intérieur du mur arrière, fils vers le GPIO du Pi. */
export const SENSOR_X = 30, SENSOR_Y = -17; // décalé de 1 cm vers le centre : la fente de ses fils (12 × 6 en x = 30,25) reste dans le compartiment, elle passait sous son mur droit (x = 43) // collé sous le plafond (le dessous du plancher du toit), à droite de la caméra, hors de la plaque alu

/** Trou de l'objectif dans le plafond intérieur, trou du câble dans le toit extérieur (mm). */
export const LENS_HOLE = 10;
/** Carte caméra Raspberry Pi (Module 3) : 25 × 24 mm. */
export const CAM_W = 25, CAM_H = 24;
/** Petite carte de 4 LED infrarouges 850 nm, posée à côté de la caméra : 12 × 24 mm. */
export const IR_W = 12, IR_H = 24;
/** Abscisses (centre) de la caméra et de la carte IR dans le compartiment : l'ensemble de 37 mm est centré. */
export const CAM_X = -6, IR_X = 12.5;
/** Deuxième caméra : mini boîte de 37 × 30 × 36 en contreplaqué posée À L'EXTÉRIEUR, sous le débord du toit en chêne, à l'avant gauche (centre en x = CAM2_X, y = CAM2_Y), inclinée et tournée pour viser le trou d'entrée ;
 *  une longue nappe sort du Pi par un trou de la plaque avant du toit. PI_CSI2 = connecteur du 2ᵉ port caméra du Pi dans le repère de la carte (provisoire : emplacement du port DSI du Pi 4 tant que le Pi 5 n'est pas intégré). */
export const CAM2_X = -72, CAM2_Y = -128, CAM2_L = 37, CAM2_D = 30, CAM2_H = 36;
export const PI_CSI2: [number, number] = [-38.5, 0];

/** Raspberry Pi 4 Model B (modèle 3D importé de public/models/pi4.bin) : carte de 85 × 56 mm, posée à plat sur le toit sur 3 mm de cales. */
export const PI_W = 85, PI_H = 56;
/** Boîtier étanche du Pi (posé sur le toit, 105 × 75 × 35, paroi 2,5) : transparent dans la vue pour voir la carte. */
export const CASE_W = 105, CASE_D = 68, CASE_H = 35, CASE_WALL = 2.5, CASE_FLOOR = 2.5;
/** Repères de la carte, dans le repère de la plaque (centre de la carte, x vers la droite, y vers l'arrière) : connecteur de la nappe caméra (dessus), broches du GPIO. */
export const PI_CSI: [number, number, number] = [4, -16.5, 6.1];
export const PI_PIN_Y = 25.77; // rangée extérieure du GPIO (broches paires : 2, 4, 6…)
export const PI_PIN_X0 = -35.4 + 1.27; // broche 2 (x de la première colonne)

/**
 * Nichoir à double paroi en deux modules :
 *  - le **corps** : une boîte extérieure et une boîte intérieure (l × L utiles), séparées par `ins` mm d'isolant ; les murs s'arrêtent sous le toit,
 *    le haut est ouvert ; trou rond dans les deux façades (avant, −y), à `floorToHole` du sol intérieur ; le plancher intérieur traverse l'isolant
 *    jusqu'aux murs extérieurs (dents dans des fentes percées dans ces murs) et les quatre murs intérieurs s'y enfoncent par les dents de leur bord bas ;
 *  - le **toit** : un module à part (boîte plate de 2 × t + ins de haut, même empreinte que le corps) qui se pose sur le haut du corps ; on le soulève
 *    pour retirer le nid. Il porte le compartiment caméra, la caméra et les LED infrarouges au-dessus d'un plancher percé (objectif et fenêtre), et une
 *    ouverture carrée dans son dessus.
 * Dimensions extérieures : utile + 2 × (t + ins + t) ; l'isolant n'est pas dessiné.
 */
/** Découpe un rectangle [x0, y0, x1, y1] en rectangles qui évitent des rectangles « trous » (bandes verticales). */
export function carveRects(r: [number, number, number, number], holes: [number, number, number, number][]): [number, number, number, number][] {
  const xs = [...new Set([r[0], r[2], ...holes.flatMap((h) => [h[0], h[2]]).filter((x) => x > r[0] && x < r[2])])].sort((p, q) => p - q), out: [number, number, number, number][] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const xa = xs[i], xb = xs[i + 1];
    const cut = holes.filter((h) => h[0] <= xa + 1e-6 && h[2] >= xb - 1e-6).map((h) => [Math.max(h[1], r[1]), Math.min(h[3], r[3])] as [number, number]).sort((p, q) => p[0] - q[0]);
    let y = r[1];
    for (const [c0, c1] of cut) { if (c0 > y + 0.01) out.push([xa, y, xb, c0]); y = Math.max(y, c1); }
    if (r[3] > y + 0.01) out.push([xa, y, xb, r[3]]);
  }
  return out;
}

export function makeNest(n0: NestParams, t: number, fit: number, start: number): { planks: Plank[]; group: string; name: string; groupNames: Record<string, string> } {
  const n: NestParams = { ...n0, l: Math.max(120, n0.l), L: Math.max(120, n0.l), hole: Math.min(n0.hole, Math.max(120, n0.l) - 26), cam: 38, ins: 39, pente: true, lambris: true }; // toit TOUJOURS en pente, habillage TOUJOURS présent (puces retirées : le régulateur sous le nichoir est protégé par l'habillage) ; // intérieur TOUJOURS CARRÉ (un seul curseur), 120 mm au minimum (le fond) ; trou plafonné pour que le bloc d'entrée (trou + 16) tienne dans la paroi intérieure ; compartiment caméra fixe à 38 (curseur retiré) ; // isolant TOUJOURS 39 (le curseur a été retiré à la demande de l'utilisateur) ; compartiment caméra plafonné à 38 // le compartiment caméra est limité à 38 : la batterie (et sa cale) est posée juste à côté, sur le dessus du toit
  const isoGroup = uid(); // cinquième groupe : l'isolant (pavés orange)
  const drainGroupId = uid(); // groupe « Évacuation »
  const solGroupId = uid(); // groupe « Solaire » : le panneau déporté, ses poteaux et son câble
  const docGroupId = uid(); // groupe « Schéma électronique » : le document, avec son œil
  const climGroupId = uid(); // sixième groupe : la climatisation (Peltier + alu + capteur)
  const lamGroup = uid(); // groupe « Lambris »
  const entryGroup = uid(); // quatrième groupe : le bloc d'entrée (empilement de carrés percés) qui traverse la double paroi
  const elecGroup = uid(); // troisième groupe : l'électronique (caméra, LED infrarouges, nappe, Raspberry Pi)
  const e = t + n.ins; // décalage de la boîte intérieure dans l'extérieure
  const W = n.l + 2 * (2 * t + n.ins), D = n.L + 2 * (2 * t + n.ins);
  const roofH = 2 * t + n.ins;
  const bodyH = n.floorToHole + n.hole + n.above + 2 * t + 2 * e - roofH; // les murs s'arrêtent là ; le toit se pose dessus
  const holeZ = e + t + n.floorToHole + n.hole / 2; // centre du trou d'envol, en z monde depuis le dessous du corps
  const outerBox = makeBox(W, D, bodyH, t, fit, start);
  const innerBox = makeBox(n.l + 2 * t, n.L + 2 * t, bodyH - e, t, fit, start);
  const roofBox = makeBox(W, D, roofH, t, fit, start);
  const group = outerBox.group, roofGroup = roofBox.group;
  const noTop = (p: Plank): Plank => { const cast = { ...(p.cast ?? {}) }; delete cast.top; return recastAll({ ...p, cast, notches: p.notches.filter((x) => x.edge !== 'top') }, t, fit); }; // mur sans crans en haut (le toit se pose dessus)
  const isWall = (p: Plank) => /^(Face|Côté)/.test(p.name);
  const OPEN = n.hole + 15; // ouverture carrée dans les deux murs avant : 1,5 cm de plus que le trou d'envol
  // l'ouverture des murs avant est une encoche ouverte vers le HAUT (largeur OPEN + 1 mm de jeu, du bas du carré jusqu'au haut du mur) : toit retiré, on pose le bloc d'entrée par le dessus
  const hole = (p: Plank): Plank => ({ ...p, notches: [...p.notches, { id: uid(), edge: 'top', pos: r2(p.w / 2), width: OPEN + 1, depth: r2(bodyH - (holeZ - OPEN / 2)) }] }); // 0,5 mm de jeu de chaque côté : le bloc coulisse à la verticale dans l'encoche, il s'arrête sur le fond
  const floorEdge = (len: number) => ({ n: teethFor(len), phase: 0 as const }); // phase 0 : coins creux, dents au milieu
  const floor: Plank = recastAll({ id: uid(), name: 'Plancher int', w: W, h: D, pos: [0, 0, e + t / 2], rot: [0, 0, 0], notches: [], holes: [], group, cast: { top: floorEdge(W), bottom: floorEdge(W), left: floorEdge(D), right: floorEdge(D) } }, t, fit);
  // barres de bois qui tiennent le toit : quatre barres courtes passent par les murs avant et arrière, de chaque côté, et s'enfoncent dans la planche du milieu du cadre
  const gapX = (n.l / 2 + t + (W / 2 - t)) / 2; // milieu de l'espace entre mur intérieur et mur extérieur
  const barZ = bodyH - 3 * t / 2; // niveau de la planche du milieu
  const BAR = 10; // largeur de la barre (sa hauteur = t)
  const barHoles = (q: Plank): Plank => ({ ...q, holes: [...q.holes, ...[-gapX, gapX].map((x) => fitHole(q, { id: uid(), shape: 'square' as const, x, y: r2(barZ - q.pos[2]), size: BAR, sh: t }))] });
  const drX = n.l / 2 - 10 - DRAIN_S / 2, drY = n.L / 2 - 10 - DRAIN_S / 2; // évacuation : coin arrière droit du nid, à 1 cm des parois intérieures, quelle que soit la taille
  const drainSquare = (q: Plank): Plank => ({ ...q, holes: [...q.holes, fitHole(q, { id: uid(), shape: 'square' as const, x: drX, y: drY, size: DRAIN_S, sh: DRAIN_S })] }); // passage de la pile d'évacuation dans un fond
  // FIXATION À L'ARBRE : deux nervures verticales en x = ± W/4, chacune = 3 PLAQUES COLLÉES (9 mm), 30 mm de profondeur, du bas du corps jusqu'au bas du toit ;
  // 3 POINTS D'ACCROCHE par nervure, deux fois plus longs qu'une dent classique (RIB_TOOTH = 32) : deux en bas dans le mur arrière du corps (fentes 9,5 × 32), un au niveau du toit
  // (encoche ouverte dans le bas de la plaque arrière du toit : le toit se pose par-dessus et se retire toujours)
  const RIB_N = 3, RIB_T = RIB_N * t, RIB_D = 15, RIB_TOOTH = 32, RIB_Z0 = 10, RIB_XS = [-W / 4, W / 4].map(r2);
  const RIB_TEETH_Z: [number, number][] = [[RIB_Z0 + 45, RIB_Z0 + 45 + RIB_TOOTH], [bodyH - 10 - RIB_TOOTH, bodyH - 10]]; // z des deux dents : une en bas (au-dessus du plancher intérieur), une en haut du corps ; plus de dent dans le toit (retirée à la demande de l'utilisateur)
  const RIB_OUT = 6, RIB_KEY = 3; // les dents ressortent de 6 mm dans l'isolant et sont percées d'un trou rectangulaire de 3 × 20 : une clavette (cale) les verrouille
  const RIB_Z1 = bodyH + 36; // haut de la nervure : elle monte le long du toit (jusqu'à 1 mm sous le tasseau arrière) pour mieux tenir, mais sans dent dans le toit : elle touche juste la face extérieure de sa plaque arrière = haut de la dent du toit (1 cm plus bas qu'avant, demande de l'utilisateur)
  const RGX = W / 2 - 45, RGY = -D / 2 + 75, RGZ = -16.5, CND_X = n.l / 2 + t, CND_D = 16, CND_Y = D / 2 - t - 10 - CND_D / 2; // régulateur sous le plancher, côté droit ; gaine à 1 cm du mur arrière
  const cam2X = -W / 2 + 33, cam2Y = -D / 2 - 23; // caméra 2 : toujours DEHORS, 23 mm devant la façade, à 33 mm du bord gauche, quelle que soit la taille du nichoir
  // quatre ÉTRIERS en U de contreplaqué qui tiennent le régulateur sous le plancher : plaque de 78 × 51 debout en travers, encoche de 62 × 42 ouverte vers le haut (le régulateur 61 × 33 + 1 de jeu),
  // bras de 8 dont les 3 mm du haut (= t) sont des tenons qui traversent le fond par des fentes 8 × 3 et AFFLEURENT son dessus : rien ne dépasse dans l'isolant
  const U_W = 78, U_ARM = 8, U_H = 46, U_TEN = t, U_YS = [-55, -22, 15, 52].map((d) => RGY + d); // gaine dans le coin arrière droit : à 1 cm du mur arrière, PILE sur le joint entre l'isolant du mur droit et celui du mur arrière (x = l/2 + t), à gauche de la barre du toit (x = 77,5…87,5) // régulateur de charge SOUS le nichoir (à plat, protégé par le lambris qui descend) ; les fils montent dans l'isolant du côté droit, dans une gaine (tuyau multicouche ou gaine électrique ICTA de diamètre minimal, 16)
  const outerParts = outerBox.planks.filter((p) => !/^Dessus/.test(p.name)).map((p) => { let q = isWall(p) ? noTop(p) : p; if (n.clim && /^Dessous/.test(p.name)) q = drainSquare(q); if (n.solar && /^Dessous/.test(p.name)) q = { ...q, holes: [...q.holes, ...U_YS.flatMap((y) => [RGX - U_W / 2 + U_ARM / 2, RGX + U_W / 2 - U_ARM / 2].map((x) => fitHole(q, { id: uid(), shape: 'square' as const, x: r2(x), y: r2(y), size: U_ARM, sh: t })))] };/* fentes des tenons des étriers du régulateur */ if (/^(Face avant|Face arrière)/.test(p.name)) q = barHoles(q); if (/^Face arrière/.test(p.name)) q = { ...q, holes: [...q.holes, ...RIB_XS.flatMap((x) => RIB_TEETH_Z.slice(0, 2).map(([za, zb]) => fitHole(q, { id: uid(), shape: 'square' as const, x, y: r2((za + zb) / 2 - q.pos[2]), size: RIB_T + 0.5, sh: zb - za })))] }; /* fentes 9,5 × 32 des deux dents basses des nervures de fixation */ return /^Face avant/.test(p.name) ? hole(q) : q; });
  const innerParts = innerBox.planks.filter(isWall).map((p) => { let q = noTop({ ...p, pos: [p.pos[0], p.pos[1], p.pos[2] + e] as Vec3, group }); return /^Face avant/.test(p.name) ? hole(q) : q; });
  // fentes (le temps du calcul, tout est « hors groupe ») : dents du plancher dans les murs extérieurs, dents du bas des murs intérieurs dans le plancher
  const free = (p: Plank): Plank => ({ ...p, group: undefined });
  const slotted = outerParts.map((p) => (isWall(p) ? slotsForTeeth({ t, fit, planks: [free(p), free(floor)] }, p.id).scene.planks[0] : p));
  const floorSlotted = slotsForTeeth({ t, fit, planks: [free(floor), ...innerParts.map(free)] }, floor.id).scene.planks[0];
  // le toit : posé sur le corps ; son dessus porte l'ouverture carrée, son dessous l'objectif et la fenêtre des LED
  // toit en pente : l'ARRIÈRE monte plus haut. Les plaques du toit sont agrandies : la plaque avant (Hf), la plaque arrière (Hb) et les deux côtés, dont le haut est une DIAGONALE
  // (de Hf à l'avant à Hb à l'arrière) SANS crénelage ; leurs arêtes verticales ont des dents de 16 mm comptées depuis le bas (elles s'emboîtent malgré les hauteurs différentes) ;
  // le dessus du toit est supprimé pour le moment
  const PENTE = 8;
  // le Raspberry Pi est en HAUT À GAUCHE du toit (coin arrière gauche), tourné de 90° (son boîtier de 105 est le long du mur de gauche)
  const piX = -(W / 2 - t) + PI_H / 2 + 1 + 10, piY = D / 2 - t - 46.5 - 1 - 10; // décollé de 1 cm du mur de gauche et du mur arrière // le Pi (89 de long avec ses prises) est dans le coin arrière gauche, sans boîtier (le toit en est déjà un)
  const pw = (lx: number, ly: number): [number, number] => [r2(piX - ly), r2(piY + lx)]; // repère de la carte (x vers sa droite, y vers son haut) → repère du nichoir
  const yFrontPi = piY - 42.5; // bord de la carte le plus proche de l'avant
  // le grenier peut être BAS : le boîtier n'est plus à l'avant, il est sous la partie haute du pan ; Hf est juste calculé pour que le pan passe 4 mm au-dessus de lui
  const Hf = Math.max(Math.ceil(roofH + 7 + 17 + 4 - (yFrontPi + D / 2) * Math.tan((PENTE * Math.PI) / 180)), Math.ceil(roofH + 3 + 32 + 4 - (-100 + D / 2) * Math.tan((PENTE * Math.PI) / 180))), Hb = Hf + Math.round(D * Math.tan((PENTE * Math.PI) / 180));
  const verticalTeeth = (edge: Edge, len: number, phase: 0 | 1): Notch[] => {
    const out: Notch[] = [];
    for (let i = 0; i * 16 < len; i++) { const a = i * 16, b = Math.min((i + 1) * 16, len); if (i % 2 === phase && b - a > 0.5) out.push({ id: uid(), edge, pos: r2((a + b) / 2), width: r2(b - a + fit), depth: t }); }
    return out;
  };
  const clipBelow = (poly: Pt[], line: (x: number) => number): Pt[] => { // garde ce qui est sous la droite y = line(x)
    const out: Pt[] = [];
    const inside = (p: Pt) => p[1] - line(p[0]) <= 1e-9;
    for (let i = 0; i < poly.length; i++) {
      const P = poly[i], Q = poly[(i + 1) % poly.length], pi = inside(P), qi = inside(Q);
      if (pi) out.push(P);
      if (pi !== qi) { const dP = P[1] - line(P[0]), dQ = Q[1] - line(Q[0]), k = dP / (dP - dQ); out.push([P[0] + (Q[0] - P[0]) * k, P[1] + (Q[1] - P[1]) * k]); }
    }
    return out;
  };
  // UNE grande aération qui occupe presque toute la plaque arrière du toit au-dessus du dessus du toit, avec 2 cm de bois de marge sur les côtés et en haut (et 4 mm au-dessus du dessus du toit)
  // renfoncement des prises du Pi : les ports (USB, Ethernet, HDMI) regardent la plaque arrière, qui est percée en face d'eux ; un petit tunnel de contreplaqué (haut + deux côtés, le dessus du toit fait le fond)
  // relie les ports à cette fenêtre, pour brancher sans ouvrir le nichoir et sans ouvrir le grenier ; l'aération démarre juste à sa droite
  const PORT_X0 = piX - 30, PORT_X1 = piX + 30, PORT_Z0 = roofH + 3, PORT_Z1 = roofH + 27, VENT_L = PORT_X1 + 26, VENT_R = W / 2 - 20; // l'aération démarre 26 mm à droite de la fenêtre des prises du Pi (20 de bois entre les deux : la lame d'habillage y est plus large)
  const VENT_XS = [(VENT_L + VENT_R) / 2], VENT_W = VENT_R - VENT_L, VENT_Z0 = roofH + 4, VENT_H = Hb - 20 - VENT_Z0, VENT_Z = VENT_Z0 + VENT_H / 2;
  const GL_Y = 84; // le câble du panneau entre dans le toit par le côté droit, à cette ordonnée, 14 mm au-dessus du dessus du toit
  const tallRoof = (p: Plank): Plank => {
    if (!n.pente) return p;
    const base = p.notches.filter((x) => x.edge === 'bottom');
    if (/^Face avant/.test(p.name)) return { ...p, holes: n.cam2 ? [{ id: uid(), shape: 'square' as const, x: cam2X - 10, y: r2(roofH + 28 - Hf / 2), size: 28, sh: 4 }] : p.holes, h: Hf, pos: [p.pos[0], p.pos[1], bodyH + Hf / 2] as Vec3, cast: undefined, notches: [...base, ...verticalTeeth('left', Hf, 0), ...verticalTeeth('right', Hf, 0)] };
    if (/^Face arrière/.test(p.name)) { // deux ouvertures d'aération au-dessus du dessus du toit (grilles anti-insectes dessus)
      const q: Plank = { ...p, h: Hb, pos: [p.pos[0], p.pos[1], bodyH + Hb / 2] as Vec3, cast: undefined, notches: [...base, ...verticalTeeth('left', Hb, 0), ...verticalTeeth('right', Hb, 0)] };
      const portWin = n.cam > 0 ? [fitHole(q, { id: uid(), shape: 'square' as const, x: r2(piX), y: r2((PORT_Z0 + PORT_Z1) / 2 - Hb / 2), size: PORT_X1 - PORT_X0, sh: PORT_Z1 - PORT_Z0 })] : []; // fenêtre des prises du Pi
      return { ...q, holes: [...q.holes, ...portWin, ...VENT_XS.map((x) => fitHole(q, { id: uid(), shape: 'square' as const, x, y: r2(VENT_Z - Hb / 2), size: VENT_W, sh: VENT_H }))] };
    }
    if (/^Côté/.test(p.name)) {
      const gland = false && n.solar && /^Côté droit/.test(p.name) ? [{ id: uid(), shape: 'round' as const, x: GL_Y, y: r2(roofH + 14 - Hb / 2), size: 10 }] : []; // passe-câble du panneau solaire
      const rect: Plank = { ...p, h: Hb, pos: [p.pos[0], p.pos[1], bodyH + Hb / 2] as Vec3, cast: undefined, notches: [...base, ...verticalTeeth('left', Hb, 1), ...verticalTeeth('right', Hb, 1)] };
      const line = (x: number) => -Hb / 2 + Hf + ((x + p.w / 2) * (Hb - Hf)) / p.w; // diagonale : Hf (avant) → Hb (arrière), sans dents
      return { ...rect, holes: gland, poly: clipBelow(outline(rect), line).map(([x, y]) => [r2(x), r2(y)] as [number, number]) };
    }
    return p;
  };
  // UN SEUL compartiment dans le toit pour la caméra, le Peltier (dissipateur) et les fils du capteur (demande de l'utilisateur : « un grand espace unique ») :
  // l'union des deux anciens compartiments, de la caméra (à l'avant) au fond du Peltier (à l'arrière), ouvert au-dessus
  const BIGC = n.clim && n.cam > 0;
  const bx0 = Math.min(-n.cam / 2, TEC_CX - TECW / 2), bx1 = Math.max(n.cam / 2, TEC_CX + TECW / 2), by0 = CAM_Y - n.cam / 2, by1 = TEC_CY + TECD / 2;
  const bcx = r2((bx0 + bx1) / 2), bcy = r2((by0 + by1) / 2), bw = r2(bx1 - bx0), bd = r2(by1 - by0);
  const roofParts0 = roofBox.planks.map((p) => {
    const q: Plank = { ...p, name: p.name.replace(/ (\d+)$/, ' toit $1'), pos: [p.pos[0], p.pos[1], p.pos[2] + bodyH] as Vec3, group: roofGroup };
    if (n.clim && !BIGC && /^Dessus/.test(p.name)) q.holes = [...q.holes, fitHole(q, { id: uid(), shape: 'square' as const, x: SENSOR_X + 0.25, y: SENSOR_Y + 8, size: 12, sh: 6 })]; // les fils du capteur montent vers le Pi (compartiment unique : ils montent dedans)
    if (n.clim && /^Dessous/.test(p.name)) q.holes = [...q.holes, fitHole(q, { id: uid(), shape: 'square' as const, x: SENSOR_X, y: SENSOR_Y, size: 19.5, sh: 18.5 })]; // logement du capteur, incrusté à fleur du plafond (ses broches sortent dans le compartiment, plus de fente à part)
    if (n.clim && /^Dessous/.test(p.name)) q.holes = [...q.holes, fitHole(q, { id: uid(), shape: 'square' as const, x: 0, y: TEC_Y, size: TEC, sh: TEC })]; // le Peltier est dans le plancher du toit, collé à la plaque alu
    if (n.clim && !BIGC && /^Dessus/.test(p.name)) q.holes = [...q.holes, fitHole(q, { id: uid(), shape: 'square' as const, x: TEC_CX, y: TEC_CY, size: TECW, sh: TECD })]; // le compartiment du dissipateur reste OUVERT au-dessus // passage du bloc alu (dessous) et du Peltier (dessus)
    if (n.cam <= 0) return q;
    if (/^Dessus/.test(p.name)) return { ...q, holes: [...q.holes, BIGC ? fitHole(q, { id: uid(), shape: 'square' as const, x: bcx, y: bcy, size: bw, sh: bd }) : fitHole(q, { id: uid(), shape: 'square' as const, x: 0, y: CAM_Y, size: n.cam, sh: n.cam })] }; // on accède au compartiment par le haut
    if (/^Dessous/.test(p.name)) return { ...q, holes: [...q.holes, fitHole(q, { id: uid(), shape: 'round' as const, x: CAM_X, y: CAM_Y, size: LENS_HOLE }), fitHole(q, { id: uid(), shape: 'square' as const, x: IR_X, y: CAM_Y, size: 10, sh: 20 })] };
    return q;
  });
  const roofParts = (() => {
    if (!n.pente) return roofParts0;
    // les plaques du toit montent (avant, arrière, côtés en trapèze) ; le DESSUS du toit, celui qui porte les composants, n'est plus crénelé : c'est une plaque simple posée sur
    // des TASSEAUX (3 mm de large × 5 de haut) collés sur la face intérieure des quatre côtés, juste sous elle
    const top = roofParts0.find((p) => /^Dessus/.test(p.name));
    const walls = roofParts0.filter((p) => !/^Dessus|^Dessous/.test(p.name)).map((p) => ({ ...tallRoof(p), group: roofGroup }));
    const xr = W / 2 - t, yr = D / 2 - t; // intérieur des plaques du toit
    const plain: Plank[] = top ? [{ ...top, w: r2(2 * xr - 0.5), h: r2(2 * yr - 0.5), notches: [], cast: undefined }] : [];
    const zt = bodyH + roofH - t; // dessous de la plaque du dessus
    const TAS_W = 3, TAS_H = 5;
    const tas = (name: string, x0: number, x1: number, y0: number, y1: number): Plank[] => (x1 - x0 > 0.01 && y1 - y0 > 0.01
      ? [{ id: uid(), name, w: r2(x1 - x0), h: r2(y1 - y0), depth: TAS_H, pos: [r2((x0 + x1) / 2), r2((y0 + y1) / 2), r2(zt - TAS_H / 2)] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: roofGroup, special: 'block' as const, color: '#a16207' }]
      : []);
    const tasseaux: Plank[] = [
      ...tas('Tasseau gauche', -xr, -xr + TAS_W, -yr, yr), ...tas('Tasseau droite', xr - TAS_W, xr, -yr, yr), // sur toute la profondeur
      ...tas('Tasseau avant', -xr + TAS_W, xr - TAS_W, -yr, -yr + TAS_W), // entre les deux
      ...carveRects([-xr + TAS_W, yr - TAS_W, xr - TAS_W, yr], n.clim ? [[(BIGC ? bx0 : TEC_CX - TECW / 2) - t, 0, (BIGC ? bx1 : TEC_CX + TECW / 2) + t, yr]] : []).flatMap(([x0, y0, x1, y1], k) => tas(`Tasseau arrière ${k + 1}`, x0, x1, y0, y1)), // l'arrière contourne le compartiment du Peltier, dont le mur le remplace
    ];
    const grilles: Plank[] = VENT_XS.map((x, k): Plank => ({ id: uid(), name: `Grille anti-insectes ${k + 1}`, w: VENT_W + 4, h: 0.8, depth: VENT_H + 4, pos: [x, D / 2 + 0.4, bodyH + VENT_Z] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: roofGroup, special: 'block' as const, color: '#475569', transparent: true })); // maille fine collée sur la face extérieure, un peu plus grande que l'ouverture
    return [...walls, ...plain, ...(roofParts0.filter((p) => /^Dessous/.test(p.name))), ...tasseaux, ...grilles];
  })();
  const floorTop = bodyH + t; // dessus du plancher du toit
  const camParts: Plank[] = n.cam > 0
    ? makeBox(BIGC ? bw + 2 * t : n.cam + 2 * t, BIGC ? bd + 2 * t : n.cam + 2 * t, n.ins, t, fit, start).planks.filter(isWall).map((p) => {
      const cast = { ...(p.cast ?? {}) }; delete cast.top; cast.bottom = { n: teethFor(p.w), phase: 0 }; // le dessus du toit fait office de couvercle ; EN BAS, des dents qui s'enfoncent dans le plancher du toit (le plafond du nid) par des fentes
      return recastAll({ ...p, name: p.name.replace(/ (\d+)$/, BIGC ? ' compartiment $1' : ' caméra $1'), h: p.h + t, pos: [p.pos[0] + (BIGC ? bcx : 0), p.pos[1] + (BIGC ? bcy : CAM_Y), p.pos[2] + floorTop - t / 2] as Vec3, group: roofGroup, cast, notches: p.notches.filter((x) => x.edge !== 'top' && x.edge !== 'bottom') }, t, fit);
    })
    : [];
  // compartiment du Peltier : quatre petits murs dans l'isolant du toit autour du dissipateur (pas d'isolant dedans), ouvert au-dessus
  const tecParts: Plank[] = n.clim && !BIGC
    ? makeBox(TECW + 2 * t, TECD + 2 * t, n.ins, t, fit, start).planks.filter(isWall).map((p) => {
      const cast = { ...(p.cast ?? {}) }; delete cast.top; delete cast.bottom;
      return recastAll({ ...p, name: p.name.replace(/ (\d+)$/, ' Peltier $1'), pos: [p.pos[0] + TEC_CX, p.pos[1] + TEC_CY, p.pos[2] + floorTop] as Vec3, group: roofGroup, cast, notches: p.notches.filter((x) => x.edge !== 'top' && x.edge !== 'bottom') }, t, fit);
    })
    : [];
  // deuxième caméra, DEHORS : mini boîte en contreplaqué (37 × 30 × 36, ouverte au-dessus) accrochée sous le débord du toit en chêne, à l'avant gauche ; elle est inclinée vers le bas et tournée
  // pour que son objectif regarde le trou d'entrée (trou de 12 dans sa face avant) ; la caméra est debout dedans, connecteur en haut
  const cam2Cz = (n.pente ? bodyH + Hf + ((cam2Y + D / 2) * (Hb - Hf)) / D : bodyH + roofH) - CAM2_H / 2 - 4; // juste sous le dessous du pan
  const cam2Target: Vec3 = [0, -D / 2 - (n.lambris ? 10 : 0), holeZ];
  const cdx = cam2Target[0] - cam2X, cdy = cam2Target[1] - cam2Y, chor = Math.hypot(cdx, cdy);
  const cam2Yaw = Math.atan2(cdx, -cdy), cam2Pitch = Math.atan2(cam2Cz - cam2Target[2], chor); // la face avant (−y) est tournée vers le trou puis baissée
  const cam2Q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), cam2Yaw).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), cam2Pitch));
  const irOff = new Vector3(-20, -3, 0).applyQuaternion(cam2Q.clone().invert()); // décalage (monde) des LED extérieures par rapport à la caméra 2 : 20 mm à sa gauche, exprimé dans le repère de la caméra
  const cam2Pt = (lx: number, ly: number, lz: number): Vec3 => { const v = new Vector3(lx, ly, lz).applyQuaternion(cam2Q); return [r2(cam2X + v.x), r2(cam2Y + v.y), r2(cam2Cz + v.z)]; }; // repère de la boîte, centré
  const camBox: Plank[] = n.cam2 ? (() => {
    const bx = makeBox(CAM2_L, CAM2_D, CAM2_H, t, fit, start);
    const planksBox: Plank[] = []; void bx; (bx.planks as Plank[]).filter(() => false).map((p) => {
      const q: Plank = { ...p, name: p.name.replace(/ (\d+)$/, ' mini-boîte caméra 2'), pos: [p.pos[0], p.pos[1], p.pos[2] - CAM2_H / 2] as Vec3, group: roofGroup };
      return /^Face avant/.test(p.name) ? { ...q, holes: [...q.holes, fitHole(q, { id: uid(), shape: 'round' as const, x: 0, y: 0, size: 12 })] } : q;
    });
    const cam2: Plank = { id: uid(), name: 'Caméra 2', w: CAM_W, h: CAM_H, pos: [0, -CAM2_D / 2 + t + 10, 0] as Vec3, rot: [-90, 0, 180] as Vec3, notches: [], holes: [], group: elecGroup, special: 'camera' };
    const ir2: Plank = { id: uid(), name: 'LED infrarouges extérieures', w: IR_W, h: IR_H, pos: [r2(irOff.x), r2(-CAM2_D / 2 + t + 10 + irOff.y), r2(irOff.z)] as Vec3, rot: [-90, 0, 180] as Vec3, notches: [], holes: [], group: elecGroup, special: 'ir' }; // à côté de la caméra 2, tournée comme elle
    const all = [...planksBox, cam2, ir2], ids = new Set(all.map((p) => p.id));
    return transformPlanks({ t, fit, planks: all }, ids, [cam2X, cam2Y, cam2Cz], cam2Q, [0, 0, 0]).planks;
  })() : [];
  const brackets: Plank[] = n.solar ? U_YS.map((y, k): Plank => ({ id: uid(), name: `Étrier régulateur ${k + 1}`, w: U_W, h: U_H, pos: [RGX, r2(y), r2(U_TEN - U_H / 2)] as Vec3, rot: rotFromBasis([1, 0, 0], [0, 0, 1]), notches: [{ id: uid(), edge: 'top' as const, pos: U_W / 2, width: U_W - 2 * U_ARM, depth: U_H - 9 }], holes: [], group })) : []; // les tenons (3 mm du haut des bras) affleurent le dessus du fond (z = +3), le fond de l'encoche est 1 mm sous le régulateur
  const LAM_T = 10, LAM_W = 46, LAM_DOWN = n.solar ? 45 : 10; // habillage : lames de ~46 (largeur exacte (W + LAM_T) / k), toutes de la même largeur
  // les nervures : RIB_N plaques de t collées côte à côte, chacune avec le même contour ; bord côté nichoir crénelé aux trois dents seulement
  const RIB_Y0 = D / 2 - t - RIB_OUT, RIB_Y1 = D / 2 + (n.lambris ? LAM_T : 0) + RIB_D; // du bout des dents (6 mm dans l'isolant) au bout de la nervure
  const mounts: Plank[] = RIB_XS.flatMap((x, k) => Array.from({ length: RIB_N }, (_, j): Plank => {
    const w = r2(RIB_Y1 - RIB_Y0), h = r2(RIB_Z1 - RIB_Z0), xj = r2(x + (j - (RIB_N - 1) / 2) * t);
    const teeth = RIB_TEETH_Z.map(([za, zb]) => [za - RIB_Z0, zb - RIB_Z0]); // en local, depuis le bas
    const gaps: [number, number][] = []; let z = 0;
    for (const [ta, tb] of teeth) { if (ta > z + 0.01) gaps.push([z, ta]); z = tb; }
    if (h > z + 0.01) gaps.push([z, h]);
    return { id: uid(), name: `Fixation arbre ${k + 1}.${j + 1}`, w, h, pos: [xj, r2((RIB_Y0 + RIB_Y1) / 2), r2((RIB_Z0 + RIB_Z1) / 2)] as Vec3, rot: rotFromBasis([0, 1, 0], [0, 0, 1]),
      notches: gaps.map(([ga, gb]) => ({ id: uid(), edge: 'left' as const, pos: r2((ga + gb) / 2), width: r2(gb - ga), depth: t + RIB_OUT })), // entre les dents, le bord est en retrait de t + 6 : seules les dents traversent le mur et ressortent
      holes: [
        ...[[-RIB_D / 2, -h / 2 + 20], [-RIB_D / 2, h / 2 - 20]].map(([hx, hy]) => ({ id: uid(), shape: 'round' as const, x: r2(w / 2 + hx), y: r2(hy), size: 5 })), // perçages Ø 5 centrés dans la partie qui dépasse (15 mm)
        ...teeth.slice(0, 2).map(([ta, tb]) => ({ id: uid(), shape: 'square' as const, x: r2(-w / 2 + RIB_OUT - RIB_KEY / 2), y: r2((ta + tb) / 2 - h / 2), size: RIB_KEY, sh: r2(tb - ta - 12) })), // trou de la clavette dans la partie qui ressort, COLLÉ à la face intérieure du mur (pas d'espace : la clavette serre la nervure contre le dos)
      ], group };
  }));
  const keys: Plank[] = RIB_XS.flatMap((x, k) => RIB_TEETH_Z.slice(0, 2).map(([za, zb], j): Plank => ({ id: uid(), name: `Clavette fixation ${k + 1}.${j + 1}`, w: r2(RIB_T + 6), h: r2(zb - za - 12 - 0.5), pos: [x, r2(D / 2 - t - RIB_KEY / 2), r2((za + zb) / 2)] as Vec3, rot: rotFromBasis([1, 0, 0], [0, 0, 1]), notches: [], holes: [], group }))); // clavette de 3, contre la face intérieure du mur : traverse les trois plaques par leur trou, dépasse de 3 de chaque côté seulement, contre la face intérieure du mur
  const camera: Plank[] = n.cam > 0 ? [
    { id: uid(), name: 'Caméra', w: CAM_W, h: CAM_H, pos: [CAM_X, CAM_Y, floorTop + 6.6] as Vec3, rot: [0, 0, 180] as Vec3, notches: [], holes: [], group: elecGroup, special: 'camera' },
    { id: uid(), name: 'LED infrarouges', w: IR_W, h: IR_H, pos: [IR_X, CAM_Y, floorTop + 0.8] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: elecGroup, special: 'ir' },
  ] : [];
  // cadre sous le toit, en trois planches collées : une planche haute et une basse, et entre elles une planche percée de fentes rectangulaires
  // (de chaque côté, d'avant en arrière) où passent les barres de bois qui traversent aussi les murs avant et arrière : le toit tient ;
  // en descendant dans l'isolant entre murs extérieur et intérieur, le cadre cale en plus le toit sur le corps
  const ring = (name: string, k: number, holes: Hole[]): Plank => ({ id: uid(), name, w: W - 2 * t, h: D - 2 * t, pos: [0, 0, bodyH - (2 * k + 1) * t / 2], rot: [0, 0, 0], notches: [], holes, group: roofGroup });
  const BAR_LEN = 50; // quatre barres courtes (5 cm) : deux à l'avant, deux à l'arrière, chacune entre par un trou du mur et s'enfonce dans une encoche de la planche du milieu
  const inside = BAR_LEN - t; // partie de la barre qui est dans l'encoche
  const notch = (edge: Edge, x: number): Notch => ({ id: uid(), edge, pos: r2(x + (W - 2 * t) / 2), width: BAR, depth: inside });
  // le cadre est en U : son ouverture centrale (l'extérieur de la boîte intérieure) est ouverte vers l'avant par une encoche qui va jusqu'au bord avant, de sorte
  // que le bloc d'entrée (plaques de 55 dans l'isolant) peut monter à fleur du haut du mur, toit retiré ou posé
  const uNotch = (): Notch => ({ id: uid(), edge: 'bottom', pos: r2((W - 2 * t) / 2), width: n.l + 2 * t, depth: r2((D / 2 - t) + (n.L / 2 + t)) });
  const bars: Plank[] = ([[-1, -1, 'avant gauche'], [1, -1, 'avant droite'], [-1, 1, 'arrière gauche'], [1, 1, 'arrière droite']] as const).map(([sx, sy, nm]): Plank => (
    { id: uid(), name: `Barre ${nm}`, w: BAR_LEN, h: BAR, pos: [sx * gapX, sy * (D / 2 - BAR_LEN / 2), barZ] as Vec3, rot: [0, 0, 90] as Vec3, notches: [], holes: [], group: roofGroup, special: 'bar' as const }));
  const frames: Plank[] = [
    { ...ring('Cadre toit haut', 0, []), notches: [uNotch()] },
    { ...ring('Cadre toit milieu', 1, []), notches: [-gapX, gapX].flatMap((x) => [notch('bottom', x), notch('top', x)]).concat(uNotch()) }, // encoches des barres sur les bords avant et arrière
    { ...ring('Cadre toit bas', 2, []), notches: [uNotch()] },
  ];
  // le Raspberry Pi sur le toit, à l'arrière (pas au-dessus de l'ouverture), calé par six petits bouts de bois collés sur le toit
  const roofTop = bodyH + roofH;
  const OAK = n.chene ? 18 : 0, topZ = roofTop + OAK; // dessus de la planche de chêne : tout ce qui est « sur le toit » (Pi, boîtier, toit en pente) se pose dessus
  const piZ = topZ + 7; // centre de la carte : sur des entretoises de 6 mm au-dessus du dessus du toit (les composants du dessous dépassent de 2,9)
  const pi: Plank[] = n.cam > 0 ? [
    { id: uid(), name: 'Raspberry Pi', w: PI_W, h: PI_H, pos: [piX, piY, piZ] as Vec3, rot: [0, 0, 90] as Vec3, notches: [], holes: [], group: elecGroup, special: 'pi' as const },
    // six cales de bois collées sur le toit, serrées contre le boîtier : deux sur chaque grand côté, une à chaque bout
    ...([[-25, -(PI_H / 2 + 2), 16, 4], [25, -(PI_H / 2 + 2), 16, 4], [-25, PI_H / 2 + 2, 16, 4], [25, PI_H / 2 + 2, 16, 4], [-(PI_W / 2 + 2), 0, 4, 16], [PI_W / 2 + 6.5, 0, 4, 16]] as const).map(([x, y, w, h], k): Plank => (
      { id: uid(), name: `Cale Pi ${k + 1}`, w: h, h: w, pos: [...pw(x, y), topZ + t / 2] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: elecGroup, special: 'bar' as const })),
  ] : [];
  // la nappe de la caméra (câble plat) : du connecteur de la caméra, elle monte par l'ouverture du toit puis court sur le toit jusqu'au connecteur du Pi
  // la nappe sort à l'HORIZONTALE du connecteur de la caméra (côté arrière), monte par l'ouverture, puis arrive à l'horizontale dans le connecteur du Pi par le côté gauche
  // (le jack audio bouche le côté droit) ; sa largeur (16) est dans l'axe de chaque connecteur
  const camZc = floorTop + 6.6 + 2.1; // hauteur du connecteur de la caméra
  const piZc = piZ + PI_CSI[2] - 2.6; // hauteur moyenne du connecteur du Pi (0,8 à 6,1 au-dessus du centre de la carte)
  // la nappe de la caméra 2 : LONGUE (la caméra est dehors) ; elle part du 2ᵉ port du Pi, court sur le dessus du toit, SORT par le trou de la plaque avant du toit et redescend jusqu'au connecteur de la caméra
  const MX = -50, MY = -16, MZ = topZ + 3; // module 2 × MOSFET des LED (20 × 14 × 6), posé sur le dessus du toit devant le Pi
  const ledSwitch: Plank[] = n.cam > 0 ? [
    { id: uid(), name: 'Module 2 MOSFET (LED infrarouges on / off)', w: 20, h: 14, depth: 6, pos: [MX, MY, MZ + 3] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: elecGroup, special: 'driver' as const, color: '#1f2937' },
    // masse du module → masse du Pi (broche 6) ; commandes : IN1 = GPIO23 (broche 16) pour les LED du nid, IN2 = GPIO24 (broche 18) pour les LED extérieures
    ...([['Fil masse module LED (noir)', '#111827', 2, 0, -4], ['Fil IN1 LED du nid (gris, GPIO23 broche 16)', '#6b7280', 7, 0, 0], ['Fil IN2 LED extérieures (blanc, GPIO24 broche 18)', '#e5e7eb', 8, 0, 4]] as const).map(([nm, color, pinIdx, _r, dx]): Plank => {
      const [xt, yt] = pw(PI_PIN_X0 + pinIdx * 2.54, PI_PIN_Y);
      return { id: uid(), name: nm, w: 1.2, h: 1.2, pos: [0, 0, 0] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: elecGroup, special: 'wire' as const, color,
        path: [[MX + dx, MY + 7, MZ + 4], [MX + dx, MY + 12, MZ + 10], [xt + 6, yt - 8, topZ + 18], [xt, yt, piZ + 8], [xt, yt, piZ + 3.5]] as Vec3[] };
    }),
  ] : [];
  const wires2: Plank[] = n.cam2 ? ([['Fil 5 V LED extérieures (rouge)', '#dc2626', 0, 0, -10.5], ['Fil masse LED extérieures (noir)', '#111827', 9, 0, -13]] as const).map(([nm, color, pinIdx, _r, dx]): Plank => {
    const [xt, yt] = pw(PI_PIN_X0 + pinIdx * 2.54, PI_PIN_Y), sx = cam2X - 10 + dx, yw = -D / 2, zs = topZ + 28; // tous les deux à GAUCHE de la nappe (à 10,5 et 13 mm de son axe ; elle fait 16 de large, la fente 28) : jamais dessus, jamais croisée
    const end = cam2Pt(irOff.x + dx / 4, -2 + irOff.y, IR_H / 2 + 2 + irOff.z);
    return { id: uid(), name: nm, w: 1.2, h: 1.2, pos: [0, 0, 0] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: elecGroup, special: 'wire' as const, color,
      path: [...(pinIdx === 9 ? [[MX + 4, MY - 7, MZ + 4], [MX + 4, MY - 12, MZ + 10], [sx + 10, -34, topZ + 24]] as Vec3[] : [[xt, yt, piZ + 3.5], [xt, yt, piZ + 10], [xt + dx, yt - 10, topZ + 27]] as Vec3[]), [sx, -46, zs + 1], [sx, yw + 12, zs], [sx, yw, zs], [sx, yw - 5, zs], [sx - 2, (yw + cam2Y) / 2, (zs + end[2]) / 2 + 2], [end[0], end[1], end[2] + 6], end] as Vec3[] };
  }) : [];
  const cable2: Plank[] = n.cam2 ? [{
    id: uid(), name: 'Nappe caméra 2 (longue, vers l\'extérieur)', w: 16, h: 0.3, pos: [0, 0, 0] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: elecGroup, special: 'cable' as const,
    path: (() => {
      const [xt, yt] = pw(PI_CSI2[0], PI_CSI2[1]);
      const con = cam2Pt(0, -2, CAM_H / 2), up = cam2Pt(0, -2, CAM_H / 2 + 14); // connecteur en haut de la caméra, qui pend dehors sous le débord
      const yw = -D / 2, zs = topZ + 28; // la fente de la plaque avant : la nappe la traverse bien à plat, perpendiculaire à la plaque
      const yo = Math.max(yw - 8, (yw + cam2Y) / 2); // deuxième point dehors : elle s'écarte du mur avant de plonger
      const sx = cam2X - 10; // la fente est dans la première lame de l'habillage, loin du joint ; la nappe monte tout de suite et passe AU-DESSUS de tout (convertisseur compris) jusqu'à la fente, haute, de la plaque avant
      return [[xt, yt, piZ + 1], [xt, yt - 6, piZ + 3], [xt, yt - 14, piZ + 10], [xt - 4, -8, topZ + 26], [sx, -46, zs + 1], [sx, yw + 12, zs], [sx, yw, zs], [sx, yw - 5, zs], [sx, yo, (zs + up[2]) / 2 + 2], [up[0], up[1], up[2]], con] as Vec3[];
    })(),
  }] : [];
  const cable: Plank[] = n.cam > 0 ? [{
    id: uid(), name: 'Nappe caméra', w: 16, h: 0.3, pos: [0, 0, 0] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: elecGroup, special: 'cable' as const,
    // sort à l'horizontale du connecteur de la caméra (vers l'avant), monte par l'ouverture, passe en arche au-dessus de la carte (composants jusqu'à 24 au-dessus du toit), puis redescend en douceur
    // sur le connecteur du Pi, où elle entre à l'horizontale ; points peu nombreux, courbe centripète
    path: (() => { const [xt, yt] = pw(PI_CSI[0], PI_CSI[1]); return [[CAM_X, CAM_Y - 6, camZc], [CAM_X, CAM_Y + 2, camZc + 10], [CAM_X, CAM_Y + 10, camZc + 23], [CAM_X - 2, CAM_Y + 16, roofTop + 2], [CAM_X - 14, CAM_Y + 30, topZ + 16], [xt + 12, yt - 14, topZ + 24], [xt, yt - 12, piZc + 12], [xt, yt - 5, piZc + 2], [xt, yt + 2, piZc]] as Vec3[]; })(), // part DIRECTEMENT en diagonale du connecteur de la caméra, monte vers le fond du nichoir (l'arrière) par l'ouverture, puis rejoint le Pi
  }] : [];
  // l'alimentation des LED infrarouges : deux fils de la carte IR au GPIO du Pi, 5 V (broche 4, rouge) et masse (broche 6, noir)
  const wires: Plank[] = n.cam > 0 ? ([['Fil 5 V (rouge)', '#dc2626', -2, 1], ['Fil masse (noir)', '#111827', 2, 2]] as const).map(([nm, color, dx, pinIdx]): Plank => {
    const sx = IR_X + dx, px = PI_PIN_X0 + pinIdx * 2.54, top = topZ + 16 + dx * 0.4;
    return { id: uid(), name: nm, w: 1.2, h: 1.2, pos: [0, 0, 0] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: elecGroup, special: 'wire' as const, color,
      path: [[sx, CAM_Y + 6, floorTop + 2], [sx, CAM_Y + 6, floorTop + 14], [sx, CAM_Y + 9, roofTop - 8], [sx, CAM_Y + 14, top], ...(pinIdx === 2 ? [[MX + 16, MY - 2, top], [MX + 10, MY - 2, MZ + 4]] as Vec3[] : [[...pw(px, 20), top], [...pw(px, PI_PIN_Y), piZ + 8], [...pw(px, PI_PIN_Y), piZ + 3.5]] as Vec3[])] as Vec3[] }; // la masse des LED passe par le module (OUT1) : le Pi peut les éteindre
  }) : [];
  // bloc d'entrée : carrés de OPEN × OPEN percés du trou d'envol, empilés sur toute l'épaisseur de la double paroi (de la face extérieure à la face intérieure),
  // avec un surplus (+12) : une collerette derrière le trou, à l'extérieur du mur extérieur, et tous les carrés qui sont dans l'isolant, entre les deux murs ; seuls les carrés qui traversent les murs restent à OPEN ;
  // rien ne dépasse dans l'espace des oiseaux : le dernier carré affleure la face intérieure ; l'encoche des murs monte jusqu'au bord, toit retiré on le descend par le haut
  const frontRot = rotFromBasis([1, 0, 0], [0, 0, 1]);
  const outFace = -D / 2, inFace = -n.L / 2; // faces extérieure du mur extérieur et intérieure du mur intérieur
  const K = Math.ceil((inFace - outFace) / t); // plaques dans l'épaisseur des murs (16 : le dernier carré affleure la face intérieure)
  // les plaques sont des RECTANGLES : elles montent toutes jusqu'en haut du mur (à fleur, elles comblent l'encoche), dans l'isolant aussi (le cadre du toit est en U, ouvert vers l'avant)
  const wallTop = bodyH;
  const plate = (name: string, w: number, bottom: number, top: number, y: number): Plank => {
    const h = r2(top - bottom), zc = r2((top + bottom) / 2);
    return { id: uid(), name, w, h, pos: [0, y, zc] as Vec3, rot: frontRot, notches: [], holes: [fitHole({ w, h } as Plank, { id: uid(), shape: 'round', x: 0, y: r2(holeZ - zc), size: n.hole })], group: entryGroup };
  };
  const narrowBottom = holeZ - OPEN / 2, wideBottom = holeZ - OPEN / 2 - 6;
  const entry: Plank[] = [
    ...Array.from({ length: K }, (_, i) => {
      const y = Math.min(outFace + t / 2 + i * t, inFace - t / 2);
      const inWall = y < outFace + t || y > inFace - t; // dans l'épaisseur d'un des deux murs (les 2 ouvertures) : 43 de large, jusqu'en haut du mur ; dans l'isolant : plus large, un peu plus bas
      return inWall ? plate(`Entrée ${i + 1}`, OPEN, narrowBottom, wallTop, y) : plate(`Entrée ${i + 1}`, OPEN + 12, wideBottom, wallTop, y);
    }),
  ];
  // l'isolant : uniquement des pavés (boîtes pleines), en orange, dans un groupe à part ; pas de découpe, pas de bois
  const xo = W / 2 - t, yo = D / 2 - t, xi = n.l / 2 + t, yi = n.L / 2 + t; // faces intérieures du mur extérieur, faces extérieures du mur intérieur
  const wide = (OPEN + 12) / 2; // demi-largeur des plaques du bloc d'entrée dans l'isolant
  const z0 = e + t, z1 = bodyH - 3 * t; // au-dessus du plancher intérieur, jusque sous le cadre du toit
  const block = (name: string, x0: number, x1: number, y0: number, y1: number, za: number, zb: number): Plank[] => (x1 - x0 > 0.01 && y1 - y0 > 0.01 && zb - za > 0.01
    ? [{ id: uid(), name, w: r2(x1 - x0), h: r2(y1 - y0), depth: r2(zb - za), pos: [r2((x0 + x1) / 2), r2((y0 + y1) / 2), r2((za + zb) / 2)] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: isoGroup, special: 'block' as const, color: '#f59e0b', transparent: true }]
    : []);
  const cc = n.cam > 0 ? (n.cam + 2 * t) / 2 : 0; // demi-côté extérieur du compartiment caméra
  const insulation: Plank[] = [
    ...carveRects([-xo, -yo, xo, yo], n.clim ? [[drX - DRAIN_S / 2, drY - DRAIN_S / 2, drX + DRAIN_S / 2, drY + DRAIN_S / 2]] : []).flatMap(([x0, y0, x1, y1], k) => block(`Isolant sous le plancher ${k + 1}`, x0, x1, y0, y1, t, e)),
    ...block('Isolant gauche', -xo, -xi, -yo, yo, z0, z1),
    ...block('Isolant droite', xi, xo, -yo, yo, z0, z1), // pavé plein : la gaine se pousse dans la laine (plus de découpe, demande de l'utilisateur)
    ...block('Isolant arrière', -xi, xi, yi, yo, z0, z1),
    ...block('Isolant avant gauche', -xi, -wide, -yo, -yi, z0, z1),
    ...block('Isolant avant droite', wide, xi, -yo, -yi, z0, z1),
    ...block("Isolant sous le bloc d'entrée", -wide, wide, -yo, -yi, z0, holeZ - OPEN / 2 - 6),
    // le toit : des pavés autour du compartiment caméra et du bloc alu du Peltier
    ...carveRects([-xo, -yo, xo, yo], [...([] as [number, number, number, number][]), ...(BIGC ? [[bx0 - t, by0 - t, bx1 + t, by1 + t] as [number, number, number, number]] : [...(n.cam > 0 ? [[-cc, CAM_Y - cc, cc, CAM_Y + cc] as [number, number, number, number]] : []), ...(n.clim ? [[TEC_CX - (TECW + 2 * t) / 2, TEC_CY - (TECD + 2 * t) / 2, TEC_CX + (TECW + 2 * t) / 2, TEC_CY + (TECD + 2 * t) / 2] as [number, number, number, number]] : [])])])
      .flatMap(([x0, y0, x1, y1], k) => block(`Isolant toit ${k + 1}`, x0, x1, y0, y1, bodyH + t, bodyH + roofH - t)),
  ];
  // climatisation : un système Peltier réaliste dans le toit, derrière le compartiment caméra ; groupe « Climatisation »
  //   côté froid (dans le nid) : ventilateur 40 + radiateur 40 à ailettes vers le bas, bloc alu qui traverse le toit et l'isolant ;
  //   Peltier TEC1-12706 dans l'ouverture du dessus ; côté chaud (dehors) : radiateur 48 à ailettes + ventilateur ; module MOSFET + prise 12 V sur le toit,
  //   fils du Peltier au module, fil de commande (PWM, broche 12) et masse (broche 14) du module au GPIO du Pi ; capteur température / humidité dans le nid
  const climGroup = n.clim ? climGroupId : undefined;
  const part = (name: string, w: number, h: number, depth: number, x: number, y: number, z: number, special: 'block' | 'heatsink' | 'fan' | 'peltier' | 'driver', color = '#cbd5e1', rot: Vec3 = [0, 0, 0]): Plank =>
    ({ id: uid(), name, w, h, depth, pos: [x, y, z] as Vec3, rot, notches: [], holes: [], group: climGroup, special, color });
  const wire = (name: string, color: string, path: Vec3[], d = 1.2): Plank => ({ id: uid(), name, w: d, h: d, pos: [0, 0, 0] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: climGroup, special: 'wire' as const, color, path });
  const DRV: [number, number] = [W / 2 - 33, 26];
  const FLX = W / 2 - t - 2 - 14, FLY = CND_Y - 1; // filtre LC du Peltier (28 × 18) : derrière le fusible, contre le mur droit, à droite de la gaine
  const CVX = -(W / 2 - t) + 10 + 18, CVY = -(D / 2 - t) + 10 + 30; // convertisseur : coin avant gauche, 1 cm des murs
  const BX = W / 2 - t - 10 - 64, BY = -(D / 2 - t) + 10 + 35; // batterie : coin avant droit, 1 cm des murs
  const WGX = W / 2 - t - 2 - 10; // les deux Wago du rail 12 V : à droite du fusible, contre le mur droit
  const FX = CND_X + 3, FY = CND_Y - 24; // fusible, près de la sortie de la gaine // centre du convertisseur : milieu de la place libre entre le tasseau gauche, la cale gauche de la batterie, le tasseau avant et la cale avant du Pi
  // plaque froide + Peltier + dissipateur forment un bloc incliné de TILT_DEG vers l'arrière (rotation autour de x) : le bord arrière est plus bas
  const TILT = (TILT_DEG * Math.PI) / 180, plateZ = r2(bodyH - t / 2 - 0.5 - (COLD_D / 2) * Math.sin(TILT));
  const stackAt = (d: number): [number, number, number] => { const dy = (TEC_Y - COLD_Y) / Math.cos(TILT); return [0, r2(COLD_Y + Math.cos(TILT) * dy + Math.sin(TILT) * d), r2(plateZ - Math.sin(TILT) * dy + Math.cos(TILT) * d)]; };
  const climate: Plank[] = n.clim ? [
    // une GRANDE plaque d'aluminium (100 × 100 × t) sous le plafond, collée au Peltier, découpée autour de l'objectif, de la fenêtre des LED et du capteur
    { id: uid(), name: 'Plaque froide alu', w: COLD_W, h: COLD_D, pos: [0, COLD_Y, plateZ] as Vec3, rot: [-TILT_DEG, 0, 0] as Vec3, notches: [], holes: [], group: climGroup, special: 'alu' as const, color: '#cbd5e1' }, // rectangle plein, derrière la caméra, légèrement incliné vers l'arrière (le bord arrière est plus bas) : l'eau coule vers la gouttière
    part('Peltier TEC1-12706', TEC, TEC, TEC_T, ...stackAt(t / 2 + TEC_T / 2), 'peltier', '#f8fafc', [-TILT_DEG, 0, 0]), // collé sur la plaque, incliné comme elle (face froide sur la plaque)
    part('Dissipateur alu', TEC, TEC, 30, ...stackAt(t / 2 + TEC_T + 15), 'heatsink', '#cbd5e1', [-TILT_DEG, 0, 0]), // posé sur la face chaude, dans le compartiment du toit : le haut est ouvert
    part('Pont en H Pololu VNH5019 (froid le jour, chaud la nuit)', 38, 28, 10, DRV[0], DRV[1], topZ + 3 + 5, 'driver', '#b91c1c'),
    part('Régulateur de charge Genasun GV-10-Li (137 × 61 × 33, sous le nichoir)', 61, 137, 33, RGX, RGY, RGZ, 'block', '#1d4ed8'), // à plat sous le plancher, le lambris descend autour pour le protéger
    part('Convertisseur 12 V → 5 V 5 A USB-C (taille à confirmer, ≈ 60 × 36 × 16)', 36, 60, 16, CVX, CVY, topZ + 3 + 8, 'block', '#0e7490'), // centré dans la place libre de l'avant gauche, calé
    part('Cale convertisseur gauche', 3, 66, t, CVX - 18 - 1.5, CVY, topZ + t / 2, 'block', '#a16207'),
    part('Cale convertisseur droite', 3, 66, t, CVX + 18 + 1.5, CVY, topZ + t / 2, 'block', '#a16207'),
    part('Cale convertisseur avant', 36, 3, t, CVX, CVY - 30 - 1.5, topZ + t / 2, 'block', '#a16207'),
    part('Cale convertisseur arrière', 36, 3, t, CVX, CVY + 30 + 1.5, topZ + t / 2, 'block', '#a16207'),
    part('Fusible lame 15 A (19 × 18 × 5, posé à plat)', 19, 18.5, 5, FX, FY, topZ + 2.5, 'block', '#dc2626'), // près de la sortie de la gaine
    part('Wago 221 (3 entrées) rail 12 V +', 20, 13, 11, WGX, FY, topZ + 3 + 5.5, 'block', '#f97316'), // bornier du rail 12 V : un fil de la batterie, deux départs (pont en H, convertisseur)
    part('Wago 221 (3 entrées) rail 12 V −', 20, 13, 11, WGX, FY - 14, topZ + 3 + 5.5, 'block', '#9ca3af'),
    part('Cale pont en H gauche', 4, 24, t, DRV[0] - 22, DRV[1], topZ + t / 2, 'block', '#a16207'),
    part('Cale pont en H droite', 4, 24, t, DRV[0] + 22, DRV[1], topZ + t / 2, 'block', '#a16207'),
    part('Cale pont en H avant', 24, 4, t, DRV[0], DRV[1] - 17, topZ + t / 2, 'block', '#a16207'),
    part('Cale pont en H arrière', 24, 4, t, DRV[0], DRV[1] + 17, topZ + t / 2, 'block', '#a16207'),
    // cales de bois autour de la batterie (tous les côtés ; à gauche c'est le mur du compartiment du Peltier qui la bloque)
    part('Cale batterie droite', 3, 76, t, BX + 64 + 1.5, BY, topZ + t / 2, 'block', '#a16207'), // cale tout autour (3 mm de large, 3 de haut) ; la batterie est à 1 cm du mur de droite et du mur avant
    part('Cale batterie gauche', 3, 76, t, BX - 64 - 1.5, BY, topZ + t / 2, 'block', '#a16207'),
    part('Cale batterie avant', 128, 3, t, BX, BY - 35 - 1.5, topZ + t / 2, 'block', '#a16207'),
    ...((): Plank[] => { // la cale arrière saute l'ouverture du compartiment si elle passe au-dessus (elle ne doit pas être dans le vide)
      const y = BY + 35 + 1.5, cut = BIGC && y > by0 - t && y < by1 + t;
      const segs: [number, number][] = cut ? ([[BX - 64, bx0 - t], [bx1 + t, BX + 64]] as [number, number][]).filter(([a, b]) => b - a > 2) : [[BX - 64, BX + 64]];
      return segs.map(([a, b], k) => part(`Cale batterie arrière${segs.length > 1 ? ' ' + (k + 1) : ''}`, r2(b - a), 3, t, r2((a + b) / 2), y, topZ + t / 2, 'block', '#a16207'));
    })(),
    part('Batterie LiFePO4 12,8 V 6 Ah (4 × 32700, 128 × 70 × 32)', 128, 70, 32, BX, BY, topZ + 3 + 16, 'block', '#047857'), // dans le grenier, coin avant droit, à 1 cm du mur de droite et du mur avant
    // filtre LC (self 100 µH 10 A + condensateur 1000 µF 25 V) entre le pont en H et le Peltier : le PWM devient un courant presque continu, le Peltier rend mieux
    part('Filtre LC Peltier (self 100 µH + condensateur 1000 µF)', 28, 18, 20, FLX, FLY, topZ + 3 + 10, 'block', '#374151'),
    part('Cale filtre avant', 28, 3, t, FLX, FLY - 9 - 1.5, topZ + t / 2, 'block', '#a16207'), // à droite c'est le mur du toit qui le bloque, à gauche la gaine
    part('Cale filtre arrière', 28, 3, t, FLX, FLY + 9 + 1.5, topZ + t / 2, 'block', '#a16207'),
    wire('Fil Peltier + (rouge)', '#dc2626', [[TEC / 2 + 0.5, TEC_Y + 5, bodyH + 2], [TEC / 2 + 0.6, TEC_Y + 5, bodyH + 36], [TEC / 2 + 0.6, TEC_Y + 5, topZ + 8], [40, 30, topZ + 10], [50, 60, topZ + 12], [66, 78, topZ + 14], [FLX - 14, FLY + 4, topZ + 11]] as Vec3[], 2.4), // Peltier → filtre (face gauche), en passant à gauche du pont en H et du fusible
    wire('Fil Peltier − (noir)', '#111827', [[TEC / 2 + 0.5, TEC_Y - 5, bodyH + 2], [TEC / 2 + 0.6, TEC_Y - 5, bodyH + 36], [TEC / 2 + 0.6, TEC_Y - 5, topZ + 8], [44, 26, topZ + 8], [54, 56, topZ + 10], [68, 72, topZ + 12], [FLX - 14, FLY - 4, topZ + 11]] as Vec3[], 2.4),
    wire('Fil filtre → pont en H + (rouge)', '#dc2626', [[FLX - 4, FLY - 9, topZ + 11], [FLX - 6, FLY - 30, topZ + 28], [DRV[0] - 12, DRV[1] + 12, topZ + 22], [DRV[0] - 15.5, DRV[1] + 5, topZ + 11]] as Vec3[], 2.4), // filtre (face avant) → sorties OUTA / OUTB du pont en H, en passant au-dessus du fusible et des fils du rail
    wire('Fil filtre → pont en H − (noir)', '#111827', [[FLX + 4, FLY - 9, topZ + 11], [FLX + 2, FLY - 30, topZ + 30], [DRV[0] - 10, DRV[1] + 2, topZ + 24], [DRV[0] - 15.5, DRV[1] - 5, topZ + 11]] as Vec3[], 2.4),
    wire('Fil régulateur → batterie + (rouge, 2,5 mm²)', '#dc2626', [[RGX - 30.5, RGY - 8, RGZ + 6], [RGX - 37, RGY - 11, RGZ + 6], [RGX - 45, RGY - 14, RGZ + 5], [RGX - 45, RGY + 50, RGZ + 5], [RGX - 41, CND_Y - 26, RGZ + 5], [RGX - 26, CND_Y - 9, RGZ + 6], [CND_X - 13, CND_Y - 4, RGZ + 8], [CND_X - 2.5, CND_Y - 2.5, -4], [CND_X - 2.5, CND_Y - 2.5, topZ + 10], [FX, FY + 10, topZ + 8]] as Vec3[], 3.6),
    wire('Fil régulateur → batterie − (noir, 2,5 mm²)', '#111827', [[RGX - 30.5, RGY + 8, RGZ + 6], [RGX - 37, RGY + 6, RGZ + 4], [RGX - 49, RGY, RGZ + 2], [RGX - 49, RGY + 90, RGZ + 2], [RGX - 40, CND_Y + 2, RGZ + 3], [CND_X - 21, CND_Y + 7, RGZ + 5], [CND_X + 2.5, CND_Y + 2.5, -4], [CND_X + 2.5, CND_Y + 2.5, topZ + 14], [(CND_X + BX) / 2 - 6, (CND_Y + BY) / 2 + 20, topZ + 36], [BX + 12, BY + 57, topZ + 40], [BX + 12, BY + 29, topZ + 36]] as Vec3[], 3.6),
    { id: uid(), name: 'Gaine des fils (ICTA Ø 16 ou multicouche Ø 16, dans l’isolant)', w: CND_D, h: CND_D, pos: [0, 0, 0] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: elecGroup, special: 'conduit' as const, color: '#1c1917', path: [[CND_X, CND_Y, -8], [CND_X, CND_Y, topZ + 6]] as Vec3[] }, // gaine annelée noire (ICTA)
    wire('Fil fusible → batterie + (rouge)', '#dc2626', [[FX, FY - 8, topZ + 8], [(FX + BX) / 2, (FY + BY) / 2, topZ + 34], [BX - 8, BY + 37, topZ + 40], [BX - 8, BY + 29, topZ + 36]] as Vec3[], 3.6),
    wire('Fil rail → pont en H + (rouge)', '#dc2626', [[FX + 4, FY - 8, topZ + 8], [DRV[0] - 2, DRV[1] + 24, topZ + 10], [DRV[0] + 3, DRV[1] + 14, topZ + 11]] as Vec3[], 3.6),
    wire('Fil rail → pont en H − (noir)', '#111827', [[BX + 12, BY + 29, topZ + 39], [BX + 20, BY + 51, topZ + 34], [DRV[0] + 22, DRV[1] - 10, topZ + 22], [DRV[0] + 22, DRV[1] + 12, topZ + 14], [DRV[0] + 13, DRV[1] + 14, topZ + 11]] as Vec3[], 3.6),
    wire('Fil rail → convertisseur + (rouge)', '#dc2626', [[DRV[0] + 10, DRV[1] - 14, topZ + 11], [DRV[0] - 32, DRV[1] - 32, topZ + 14], [MX + 10, MY, topZ + 20], [MX - 10, MY - 4, topZ + 20], [CVX + 7, CVY + 36, topZ + 14], [CVX + 7, CVY + 30, topZ + 11]] as Vec3[], 3.6),
    wire('Fil rail → convertisseur − (noir)', '#111827', [[DRV[0] + 2, DRV[1] - 14, topZ + 11], [DRV[0] - 38, DRV[1] - 24, topZ + 12], [MX + 8, MY + 6, topZ + 24], [MX - 20, MY - 4, topZ + 22], [CVX - 7, CVY + 40, topZ + 13], [CVX - 7, CVY + 30, topZ + 11]] as Vec3[], 3.6),
    wire('Fil INA du pont en H (bleu, broche 33)', '#2563eb', [[DRV[0] + 2, DRV[1] - 9, topZ + 8], [DRV[0] - 14, DRV[1] - 16, topZ + 21], [20, 6, topZ + 24], [-40, 5, topZ + 24], [...pw(PI_PIN_X0 + 16 * 2.54, PI_PIN_Y - 2.54 + 8), topZ + 24], [...pw(PI_PIN_X0 + 16 * 2.54, PI_PIN_Y - 2.54), piZ + 8], [...pw(PI_PIN_X0 + 16 * 2.54, PI_PIN_Y - 2.54), piZ + 3.5]] as Vec3[]),
    wire('Fil INB du pont en H (vert, broche 35)', '#16a34a', [[DRV[0] + 9, DRV[1] - 9, topZ + 8], [DRV[0] - 10, DRV[1] - 20, topZ + 21], [20, 6, topZ + 26], [-40, 5, topZ + 26], [...pw(PI_PIN_X0 + 17 * 2.54, PI_PIN_Y - 2.54 + 8), topZ + 24], [...pw(PI_PIN_X0 + 17 * 2.54, PI_PIN_Y - 2.54), piZ + 8], [...pw(PI_PIN_X0 + 17 * 2.54, PI_PIN_Y - 2.54), piZ + 3.5]] as Vec3[]),
    wire('Fil PWM du pont en H (violet, broche 12)', '#7c3aed', [[DRV[0], DRV[1] - 9, topZ + 8], [DRV[0] - 10, DRV[1] - 16, topZ + 18], [20, 6, topZ + 20], [-40, 5, topZ + 20], [...pw(PI_PIN_X0 + 5 * 2.54, PI_PIN_Y + 8), topZ + 20], [...pw(PI_PIN_X0 + 5 * 2.54, PI_PIN_Y), piZ + 8], [...pw(PI_PIN_X0 + 5 * 2.54, PI_PIN_Y), piZ + 3.5]] as Vec3[]),
    wire('Fil masse commande (noir)', '#111827', [[DRV[0] + 3, DRV[1] - 9, topZ + 8], [DRV[0] - 6, DRV[1] - 16, topZ + 15], [20, 6, topZ + 17], [-40, 5, topZ + 17], [...pw(PI_PIN_X0 + 6 * 2.54, PI_PIN_Y + 6), topZ + 17], [...pw(PI_PIN_X0 + 6 * 2.54, PI_PIN_Y), piZ + 8], [...pw(PI_PIN_X0 + 6 * 2.54, PI_PIN_Y), piZ + 3.5]] as Vec3[]),
    wire('Fil VDD logique du pont en H (orange, 3,3 V broche 17)', '#f97316', [[DRV[0] - 4, DRV[1] - 9, topZ + 8], [DRV[0] - 8, DRV[1] - 14, topZ + 16], [DRV[0] - 14, DRV[1] - 22, topZ + 22], [20, -2, topZ + 24], [-40, -3, topZ + 24], [...pw(PI_PIN_X0 + 8 * 2.54, PI_PIN_Y - 2.54 + 6), topZ + 14], [...pw(PI_PIN_X0 + 8 * 2.54, PI_PIN_Y - 2.54), piZ + 8], [...pw(PI_PIN_X0 + 8 * 2.54, PI_PIN_Y - 2.54), piZ + 3.5]] as Vec3[]), // alimentation logique du VNH5019 (VDD 2,5–5,5 V) : il manquait
    { id: uid(), name: 'Sonde température dissipateur (DS18B20, face chaude)', w: 5, h: 5, depth: 6, pos: [0, r2(TEC_Y + 8), r2(stackAt(t / 2 + TEC_T + 30)[2] + 3)] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: climGroup, special: 'block' as const, color: '#111827' }, // petit boîtier noir glissé entre deux ailettes, SUR le dissipateur (demande de l'utilisateur)
    ...([['Fil sonde 3,3 V (rouge)', '#dc2626', 0, 0], ['Fil sonde données (bleu, GPIO4 broche 7)', '#2563eb', 3, 1], ['Fil sonde masse (noir, broche 25)', '#111827', 12, 2]] as const).map(([nm, color, pinIdx, k]): Plank => {
      const sx = -2 + k * 2, px = PI_PIN_X0 + pinIdx * 2.54, py = pinIdx % 2 === 0 && pinIdx !== 0 ? PI_PIN_Y : PI_PIN_Y - 2.54, hh = topZ + 30 + k * 2; // broches 1 et 7 : rangée impaire ; broche 25 : rangée paire
      const z0 = stackAt(t / 2 + TEC_T + 30)[2] + 6;
      return wire(nm, color, [[sx, TEC_Y + 11, z0], [sx, TEC_Y + 16, z0 + 6], [sx - 20, TEC_Y + 10, hh], [-20, 30, hh], [...pw(px, py + 6), hh], [...pw(px, py), piZ + 8], [...pw(px, py), piZ + 3.5]] as Vec3[]);
    }),
    { id: uid(), name: 'Capteur température / humidité (BME280, 19 × 18)', w: 19, h: 18, pos: [SENSOR_X, SENSOR_Y, bodyH + 2.2] as Vec3, rot: [180, 0, 0] as Vec3, notches: [], holes: [], group: climGroup, special: 'sensor' as const },
    ...([['Fil 3,3 V (rouge)', '#dc2626', 0, 0], ['Fil SDA (jaune)', '#eab308', 1, 1], ['Fil SCL (vert)', '#16a34a', 2, 2], ['Fil masse (noir)', '#111827', 4, 3]] as const).map(([nm, color, pinIdx, k]): Plank => {
      const sx = SENSOR_X - 3.75 + k * 2.5, px = PI_PIN_X0 + pinIdx * 2.54, hh = topZ + 24 + k * 2;
      return wire(nm, color, [[sx, SENSOR_Y - 7.5, bodyH + 6], [sx, SENSOR_Y - 4, bodyH + 12], [sx, SENSOR_Y - 4, bodyH + roofH - 6], [sx, SENSOR_Y - 4, hh], [...pw(px, PI_PIN_Y - 2.54), hh], [...pw(px, PI_PIN_Y - 2.54), piZ + 3.5]] as Vec3[]);
    }),
  ] : [];
  // système solaire (groupe « Solaire ») : un panneau de 100 W DÉPORTÉ à côté du nichoir, sans piquet en bois (support métallique non dessiné), incliné de 35° et tourné vers l'avant (« le sud »),
  // et un câble qui rejoint le régulateur dans le toit (la batterie, le régulateur et le pont en H sont dans le toit)
  const solGroup = n.solar ? solGroupId : undefined;
  const SX = 700, TILT_P = 35;
  const sp = (name: string, w: number, h: number, depth: number, x: number, y: number, z: number, color: string, rot: Vec3 = [0, 0, 0]): Plank =>
    ({ id: uid(), name, w, h, depth, pos: [x, y, z] as Vec3, rot, notches: [], holes: [], group: solGroup, special: 'block' as const, color });
  const solar: Plank[] = n.solar ? [
    { ...sp('Panneau solaire 100 W (97 × 58,5)', 970, 585, 30, SX, 0, 195, '#1e3a8a', [TILT_P, 0, 0]), special: 'solar' as const }, // posé sur un support métallique (pas dessiné : aucun piquet en bois), bord bas près du sol
    { id: uid(), name: 'Câble 12 V vers le toit', w: 7, h: 7, pos: [0, 0, 0] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: solGroup, special: 'wire' as const, color: '#111827',
      path: [[SX + 20, 40, 190], [SX + 60, 40, 80], [SX + 60, 40, 15], [300, 40, 6], [W / 2 + 95, RGY + 10, 4], [W / 2 + 55, RGY - 10, -14], [W / 2 + 30, RGY, -40], [W / 2 + 7, RGY, -52], [W / 2 - 8, RGY, -40], [RGX + 30.5, RGY, RGZ]] as Vec3[] },
  ] : [];
  // habillage (groupe spécial « Habillage ») : un pourtour en lambris de 10 mm d'épaisseur qui descend de 10 mm sous le nichoir, et un toit en chêne qui déborde

  // un lambris = un prisme : contour en plan (rectangle ou trapèze à 45° aux coins), du bas jusqu'à un plan incliné (haut en diagonale sur les côtés)
  const prism = (name: string, plan: [number, number][], zBottom: number, A: number, Bx: number, By: number): Plank => {
    const cx = plan.reduce((s, p) => s + p[0], 0) / plan.length, cy = plan.reduce((s, p) => s + p[1], 0) / plan.length;
    const zMax = Math.max(...plan.map(([x, y]) => A + Bx * x + By * y)), zc = (zBottom + zMax) / 2;
    const xs = plan.map((p) => p[0]), ys = plan.map((p) => p[1]);
    return { id: uid(), name, w: r2(Math.max(...xs) - Math.min(...xs)), h: r2(Math.max(...ys) - Math.min(...ys)), depth: r2(zMax - zBottom), pos: [r2(cx), r2(cy), r2(zc)] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: lamGroup, special: 'block' as const, color: '#f5f5f4',
      poly: plan.map(([x, y]) => [r2(x - cx), r2(y - cy)] as [number, number]), top: { z0: r2(A + Bx * cx + By * cy - zc), bx: Bx, by: By } };
  };
  const lambris: Plank[] = n.lambris ? (() => {
    const xe = W / 2, ye = D / 2, k = Math.max(1, Math.round((W + 2 * LAM_T) / LAM_W)), kd = Math.max(1, Math.round(D / LAM_W)), sx = (2 * xe + 2 * LAM_T) / k, sy = (2 * ye) / kd; // façade et arrière : W + 2·LAM_T (elles recouvrent les bouts des côtés) ; côtés : D ; une largeur fixe par face
    const fx0 = -(xe + LAM_T), bx0l = -(xe + LAM_T), ry0 = -ye, ly0 = -ye; // début des lames : façade et arrière de −(xe + LAM_T) à xe + LAM_T, côtés de −ye à ye
    const out: Plank[] = [];
    // les lames MONTENT JUSQU'AU TOIT : à plat sur la façade (hauteur Hf du toit) et l'arrière (Hb), en DIAGONALE sur les côtés (elles suivent le haut des côtés du toit) ;
    // les COINS sont à JOINT PLAT : la façade et l'arrière recouvrent les bouts des lames des côtés (demande de l'utilisateur) ; même largeur sur la façade et l'arrière, une autre largeur sur les côtés
    const frontTop = n.pente ? bodyH + Hf : roofTop, backTop = n.pente ? bodyH + Hb : roofTop;
    const slope = n.pente ? (Hb - Hf) / (2 * ye) : 0, sideA = n.pente ? bodyH + Hf + ye * slope : roofTop; // z = sideA + slope · y sur les côtés
    for (let i = 0; i < kd; i++) { // côtés gauche et droit : lames le long de y
      const ry0i = ry0 + i * sy, ry1i = ry0 + (i + 1) * sy, ly0i = ly0 + i * sy, ly1i = ly0 + (i + 1) * sy; // côtés : de −ye à ye, entre la façade et l'arrière
      const y0 = ry0i, y1 = ry1i, y0o = ry0i, y1o = ry1i;
      if (false && n.solar && n.pente && y0 < GL_Y && GL_Y < y1) { // la lame du côté droit que traverse le câble du panneau est percée d'une fenêtre (14 de large, 16 de haut)
        const wa = GL_Y - 7, wb = GL_Y + 7, za = topZ + 6, zb2 = topZ + 22;
        const piece = (nm: string, ya: number, yb: number, zBot: number, A: number, By: number, oa = ya, ob = yb) => out.push(prism(nm, [[xe, ya], [xe + LAM_T, oa], [xe + LAM_T, ob], [xe, yb]], zBot, A, 0, By));
        piece(`Lambris droite ${i + 1}.a`, y0, wa, -LAM_DOWN, sideA, slope, y0o, wa);
        piece(`Lambris droite ${i + 1}.b`, wb, y1, -LAM_DOWN, sideA, slope, wb, y1o);
        piece(`Lambris droite ${i + 1}.c`, wa, wb, -LAM_DOWN, za, 0);
        piece(`Lambris droite ${i + 1}.d`, wa, wb, zb2, sideA, slope);
      } else out.push(prism(`Lambris droite ${i + 1}`, [[xe, y0], [xe + LAM_T, y0o], [xe + LAM_T, y1o], [xe, y1]], -LAM_DOWN, sideA, 0, slope));
      out.push(prism(`Lambris gauche ${i + 1}`, [[-xe - LAM_T, ly0i], [-xe, ly0i], [-xe, ly1i], [-xe - LAM_T, ly1i]], -LAM_DOWN, sideA, 0, slope));
    }
    const windows: [number, number, number, number][] = n.pente ? [...VENT_XS.map((vx): [number, number, number, number] => [vx - (VENT_W + 8) / 2, bodyH + VENT_Z - (VENT_H + 8) / 2, vx + (VENT_W + 8) / 2, bodyH + VENT_Z + (VENT_H + 8) / 2]), ...(n.cam > 0 ? [[PORT_X0 - 4, bodyH + PORT_Z0 - 4, PORT_X1 + 4, bodyH + PORT_Z1 + 4] as [number, number, number, number]] : [])] : []; // fenêtres des grilles d'aération (à l'arrière)
    const frontWindows: [number, number, number, number][] = n.cam2 && n.pente ? [[cam2X - 10 - 16, bodyH + roofH + 28 - 6, cam2X - 10 + 16, bodyH + roofH + 28 + 6]] : []; // fenêtre 24 × 12 dans l'habillage avant, en face de la fente de la nappe de la caméra 2 (20 × 4)
    // les fenêtres sont AIMANTÉES aux joints entre lames et entre elles (à moins de 6 mm) : sinon il restait des lamelles de 2 ou 3 mm entre une fenêtre et un joint, ou entre deux fenêtres
    const jointsF = Array.from({ length: k - 1 }, (_, i) => fx0 + (i + 1) * sx), jointsB = Array.from({ length: k - 1 }, (_, i) => bx0l + (i + 1) * sx);
    const snapWins = (ws: [number, number, number, number][], joints: number[]) => {
      for (const w of ws) for (const j of joints) { if (Math.abs(w[0] - j) < 10) w[0] = j; if (Math.abs(w[2] - j) < 10) w[2] = j; }
      for (const a of ws) for (const b of ws) { if (a !== b && Math.abs(a[2] - b[0]) < 10) b[0] = a[2]; }
    };
    snapWins(windows, jointsB); snapWins(frontWindows, jointsF);
    for (const x of RIB_XS) windows.push([x - RIB_T / 2 - 0.25, RIB_Z0 - 1, x + RIB_T / 2 + 0.25, RIB_Z1 + 1]); // les nervures de fixation traversent les lames arrière par une fente de 3,5 (ajoutées APRÈS l'aimantation : une fente de 3,5 ne doit pas être élargie jusqu'au joint)
    // façade et arrière : CHAQUE LAME EST UNE SEULE PLANCHE de largeur fixe (sx), percée de ses fenêtres (trous rectangulaires) ; une fenêtre qui mord sur le bord d'une lame
    // devient une encoche de ce bord ; seule une fenêtre qui traverse TOUTE la largeur d'une lame (la grande aération) la coupe en deux planches (dessous / dessus)
    type R = [number, number, number, number];
    const lame = (name: string, xa: number, xb: number, yFace: number, zBot: number, zTop: number, wins: R[], round: { x: number; z: number; d: number } | null) => {
      const E = 0.01;
      const clipped: R[] = wins.map(([wa, za, wb, zb]): R => [Math.max(wa, xa), Math.max(za, zBot), Math.min(wb, xb), Math.min(zb, zTop)]).filter(([wa, za, wb, zb]) => wb - wa > E && zb - za > E);
      const full = clipped.filter(([wa, , wb]) => wa <= xa + E && wb >= xb - E).sort((p, q) => p[1] - q[1]); // traversent toute la lame : la coupent en morceaux selon z
      const zs: [number, number][] = []; let z = zBot;
      for (const [, za, , zb] of full) { if (za - z > 1) zs.push([z, za]); z = Math.max(z, zb); }
      if (zTop - z > 1) zs.push([z, zTop]);
      zs.forEach(([z0, z1], kk) => {
        const here = clipped.filter(([wa, za, wb, zb]) => !(wa <= xa + E && wb >= xb - E) && zb > z0 + E && za < z1 - E).map(([wa, za, wb, zb]): R => [wa, Math.max(za, z0 + 1), wb, Math.min(zb, z1 - 1)]);
        const left = here.filter(([wa]) => wa <= xa + E).sort((p, q) => p[1] - q[1]), right = here.filter(([, , wb]) => wb >= xb - E).sort((p, q) => p[1] - q[1]);
        const inner = here.filter(([wa, , wb]) => wa > xa + E && wb < xb - E);
        const cx = (xa + xb) / 2, cz = (z0 + z1) / 2;
        const poly: [number, number][] = [[xa, z0], [xb, z0]];
        for (const [wa, za, , zb] of right) poly.push([xb, za], [wa, za], [wa, zb], [xb, zb]);
        poly.push([xb, z1], [xa, z1]);
        for (const [, za, wb, zb] of [...left].reverse()) poly.push([xa, zb], [wb, zb], [wb, za], [xa, za]);
        const holes: Hole[] = inner.map(([wa, za, wb, zb]) => ({ id: uid(), shape: 'square' as const, x: r2((wa + wb) / 2 - cx), y: r2((za + zb) / 2 - cz), size: r2(wb - wa), sh: r2(zb - za) }));
        if (round && round.z > z0 && round.z < z1) holes.push({ id: uid(), shape: 'round' as const, x: r2(round.x - cx), y: r2(round.z - cz), size: round.d });
        out.push({ id: uid(), name: `${name}${zs.length > 1 ? '.' + (kk + 1) : ''}`, w: r2(xb - xa), h: r2(z1 - z0), depth: LAM_T, pos: [r2(cx), yFace, r2(cz)] as Vec3, rot: rotFromBasis([1, 0, 0], [0, 0, 1]), notches: [], holes, group: lamGroup, special: 'block' as const, color: '#f5f5f4',
          poly: poly.map(([x, y]) => [r2(x - cx), r2(y - cz)] as [number, number]) });
      });
    };
    for (let i = 0; i < k; i++) {
      const x0 = fx0 + i * sx, x1 = fx0 + (i + 1) * sx, centre = x0 < 0 && x1 > 0; // façade : la lame qui porte le centre de l'entrée est percée du trou d'envol
      const bx0i = bx0l + i * sx, bx1i = bx0l + (i + 1) * sx; // arrière : décalé d'une épaisseur (recouvre le coin droit)
      lame(`Lambris avant ${i + 1}${centre ? ' (percé)' : ''}`, x0, x1, -ye - LAM_T / 2, -LAM_DOWN, frontTop, frontWindows, centre ? { x: 0, z: holeZ, d: n.hole } : null);
      lame(`Lambris arrière ${i + 1}`, bx0i, bx1i, ye + LAM_T / 2, -LAM_DOWN, backTop, windows, null);
    }
    // toit en chêne : un pan de 18 mm posé sur la diagonale des côtés du toit ; il déborde de 60 mm devant (abri de l'entrée) et de 30 mm seulement sur les côtés et derrière
    if (n.pente) {
      const OVF = 60, OVS = 30, OVB = 30, thick = 18, ang = Math.atan2(Hb - Hf, D);
      const yMid = (OVB - OVF) / 2; // centre du pan en plan : décalé vers l'avant
      const zl = (y: number) => bodyH + Hf + ((y + D / 2) * (Hb - Hf)) / D; // dessous du pan à l'ordonnée y
      out.push({ id: uid(), name: 'Toit en chêne', w: r2(W + 2 * OVS), h: r2((D + OVF + OVB) / Math.cos(ang)), depth: thick, pos: [0, r2(yMid - Math.sin(ang) * thick / 2), r2(zl(yMid) + Math.cos(ang) * thick / 2)] as Vec3, rot: [r2((ang * 180) / Math.PI), 0, 0] as Vec3, notches: [], holes: [], group: lamGroup, special: 'block' as const, color: '#c4a574' });
    }
    return out;
  })() : [];
  const pitched: Plank[] = []; // (les joues séparées sont supprimées : ce sont les plaques du toit elles-mêmes qui montent)
  // planche de chêne de 18 mm sur le toit, qui déborde de 15 mm : découpée en pavés autour de l'ouverture du compartiment et de la fente des fils du capteur
  const OV_OAK = 15;
  const carve = (r: [number, number, number, number], holes: [number, number, number, number][]): [number, number, number, number][] => {
    const xs = [...new Set([r[0], r[2], ...holes.flatMap((h) => [h[0], h[2]]).filter((x) => x > r[0] && x < r[2])])].sort((p, q) => p - q), out: [number, number, number, number][] = [];
    for (let i = 0; i + 1 < xs.length; i++) {
      const xa = xs[i], xb = xs[i + 1];
      const cut = holes.filter((h) => h[0] <= xa + 1e-6 && h[2] >= xb - 1e-6).map((h) => [Math.max(h[1], r[1]), Math.min(h[3], r[3])] as [number, number]).sort((p, q) => p[0] - q[0]);
      let y = r[1];
      for (const [c0, c1] of cut) { if (c0 > y + 0.01) out.push([xa, y, xb, c0]); y = Math.max(y, c1); }
      if (r[3] > y + 0.01) out.push([xa, y, xb, r[3]]);
    }
    return out;
  };
  const oakHoles: [number, number, number, number][] = [];
  if (BIGC) oakHoles.push([bx0, by0, bx1, by1]); else if (n.cam > 0) oakHoles.push([-n.cam / 2, -n.cam / 2, n.cam / 2, n.cam / 2]);
  if (n.clim && !BIGC) oakHoles.push([SENSOR_X + 0.25 - 6, SENSOR_Y + 8 - 3, SENSOR_X + 0.25 + 6, SENSOR_Y + 8 + 3]);
  const oak: Plank[] = n.chene
    ? carve([-(W / 2 + OV_OAK), -(D / 2 + OV_OAK), W / 2 + OV_OAK, D / 2 + OV_OAK], oakHoles).map(([x0, y0, x1, y1], k): Plank => (
      { id: uid(), name: `Planche chêne ${k + 1}`, w: r2(x1 - x0), h: r2(y1 - y0), depth: OAK, pos: [r2((x0 + x1) / 2), r2((y0 + y1) / 2), r2(roofTop + OAK / 2)] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: roofGroup, special: 'block' as const, color: '#c4a574' }))
    : [];
  // évacuation : la gouttière est une lamelle de contreplaqué de 3 mm × 5 de large, collée contre le mur, en diagonale (10°), qui reste EN HAUT contre le mur arrière sous la plaque froide :
  // les gouttes y glissent vers le coin arrière droit puis ruissellent dans le coin jusqu'au trou, tout en bas, percé vers le bas à travers le fond (pile de carrés percés d'un trou de paille)
  const drainGroup = n.clim ? drainGroupId : undefined;
  const SLOPE = 10, gx0 = -55, gx1 = 55, gAng = (SLOPE * Math.PI) / 180, gLen = (gx1 - gx0) / Math.cos(gAng);
  const gTop = bodyH - 9 - (gx1 - gx0) * Math.tan(gAng) / 2 - 3; // centre de la barre
  const drain: Plank[] = n.clim ? [
    { id: uid(), name: 'Gouttière (contreplaqué 3 mm)', w: r2(gLen), h: 5, pos: [0, n.L / 2 - t / 2, r2(gTop)] as Vec3, rot: rotFromBasis([Math.cos(gAng), 0, -Math.sin(gAng)], [Math.sin(gAng), 0, Math.cos(gAng)]), notches: [], holes: [], group }, // une lamelle de contreplaqué de 3 mm, large de 5, collée à plat contre la face intérieure du mur arrière, en diagonale
    ...(n.solar ? Array.from({ length: 12 }, (_, i): Plank => ({ id: uid(), name: `Évacuation bas ${i + 1}`, w: DRAIN_S, h: DRAIN_S, pos: [drX, drY, r2(-t / 2 - i * t)] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [{ id: uid(), shape: 'round' as const, x: 0, y: 0, size: DRAIN_HOLE }], group: drainGroup })) : []), // le tuyau descend sous le nichoir, plus bas que le régulateur (36 mm)
    ...Array.from({ length: Math.ceil(e + t) / t | 0 }, (_, i): Plank => ({ id: uid(), name: `Évacuation ${i + 1}`, w: DRAIN_S, h: DRAIN_S, pos: [drX, drY, r2(t / 2 + i * t)] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [{ id: uid(), shape: 'round' as const, x: 0, y: 0, size: DRAIN_HOLE }], group: drainGroup })),
  ] : [];
  const planks = [
    ...drain,
    ...oak,
    ...lambris, ...pitched,
    ...solar, ...brackets, ...mounts, ...keys,
    ...camBox, ...cable2, ...wires2, ...ledSwitch,
    ...climate,
    ...insulation,
    ...entry,
    ...slotted.map((p) => ({ ...p, group, name: p.name.replace(/ (\d+)$/, ' ext $1') })),
    { ...(n.clim ? drainSquare(floorSlotted) : floorSlotted), group },
    ...innerParts.map((p) => ({ ...p, name: p.name.replace(/ (\d+)$/, ' int $1') })),
    ...roofParts, ...frames, ...bars, ...camParts, ...tecParts, ...camera, ...pi, ...cable, ...wires,
    { id: uid(), name: 'Schéma électronique', w: 1, h: 1, pos: [0, 0, -30] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [], group: docGroupId, special: 'doc' as const }, // document (pas une pièce physique) : un clic dans « Pièces » l'ouvre
  ];
  if (n.solar) { // la gaine traverse le fond, le plancher intérieur, le cadre du toit et le plancher / dessus du toit, dans l'isolant du côté droit
    for (const p of planks) if (/^(Dessous ext|Plancher int|Cadre toit (bas|milieu|haut)|Dessous toit|Dessus toit)/.test(p.name)) p.holes = [...p.holes, fitHole(p, { id: uid(), shape: 'round' as const, x: r2(CND_X - p.pos[0]), y: r2(CND_Y - p.pos[1]), size: CND_D })]; // pile le diamètre de la gaine, serrée (plus de jeu : elle nageait)
  }
  if (n.cam > 0) { // fentes du plancher du toit pour les dents du bas des murs du compartiment
    const tmp: PlankScene = { t, fit, planks: planks.map((p) => (/ (compartiment|caméra) \d+$/.test(p.name) && !p.special ? { ...p, group: '__compartiment' } : p)) };
    const floor = tmp.planks.find((p) => /^Dessous toit/.test(p.name));
    if (floor) { const r = slotsForTeeth(tmp, floor.id); const q = r.scene.planks.find((p) => p.id === floor.id); const f = planks.find((p) => p.id === floor.id); if (q && f) f.holes = q.holes; }
  }
  // UN SEUL groupe « Toit » : le toit, l'électronique (Pi, caméra, nappe, fils) et la climatisation (Peltier, dissipateur, module, capteur) bougent ensemble
  const merged = new Set([climGroupId, solGroupId]);
  const LINKS: [RegExp, string][] = [ // fiches de référence (constructeur ou revendeur)
    [/^Raspberry Pi/, 'https://www.raspberrypi.com/products/raspberry-pi-5/'],
    [/^Caméra( 2)?$/, 'https://www.raspberrypi.com/products/camera-module-3/'],
    [/^Peltier/, 'https://www.radiolocman.com/datasheet/pdf.html?di=173597'],
    [/^Pont en H/, 'https://www.pololu.com/product/1451'],
    [/^Wago/, 'https://www.wago.com/fr/bornes-de-connexion-pour-conducteurs/221-413'],
    [/^Batterie/, 'https://robu.in/?p=2024523'],
    [/^Régulateur/, 'https://azcus.digikey.com/en/products/detail/genasun/GV-10-Li-14-2V-OEM/24614948'],
    [/^Capteur/, 'https://cdn.sparkfun.com/assets/5/3/0/f/7/BME280_Datasheet.pdf'],
    [/^Panneau solaire/, 'https://www.wattuneed.com/fr/panneaux-solaires/8120-panneau-solaire-12v-100wc-monocristallin-0712971138629.html'],
  ];
  const underRoof = (pt: Vec3): Vec3 => (n.pente && Math.abs(pt[0]) < W / 2 - t && Math.abs(pt[1]) < D / 2 - t ? [pt[0], pt[1], r2(Math.min(pt[2], bodyH + Hf + ((pt[1] + D / 2) * (Hb - Hf)) / D - 2))] : pt); // fils et nappes restent sous la pente du toit
  const unnumber = (nm: string) => (start === 1 ? nm.replace(/^((?:Face avant|Face arrière|Côté droit|Côté gauche|Dessus|Dessous)(?: (?:ext|int|toit|compartiment))?|Grille anti-insectes) 1$/, "$1") : nm); // un seul nichoir : plus de « 1 » derrière les plaques des boîtes (les numéros des séries — lambris, cales, isolant… — restent)
  const finalPlanks = planks.map((p) => { let q = p.group && merged.has(p.group) ? { ...p, group: elecGroup, name: unnumber(p.name) } : { ...p, name: unnumber(p.name) }; if (q.path && q.special !== 'solar' && q.name !== 'Câble 12 V vers le toit') q = { ...q, path: q.path.map(underRoof) }; const l = LINKS.find(([re]) => re.test(q.name)); return l ? { ...q, url: l[1] } : q; });
  return { planks: finalPlanks, group, name: 'Corps', groupNames: { [group]: 'Corps', [roofGroup]: 'Toit', [elecGroup]: 'Électronique', [docGroupId]: 'Schéma électronique', [entryGroup]: 'Entrée', [isoGroup]: 'Isolant', ...(n.clim ? { [drainGroupId]: 'Évacuation' } : {}), ...(n.lambris ? { [lamGroup]: 'Habillage' } : {}) } }; // un seul nichoir : groupes sans numéro, le corps s'appelle « Corps »
}
