/**
 * Pavé isolé à 6 faces : 4 murs « en moulin » + plancher + toit, tous en sandwich (plaque extérieure, cadre de 4 bords de
 * `ins` de haut rempli de laine de bois, plaque intérieure), angles affleurants, assemblage par boulons + écrous, sans doigts.
 *
 * Repère d'un mur : x = longueur, y = hauteur, z = 0 (face intérieure) → T (face extérieure). Le corps (plaque intérieure,
 * cadre, laine) occupe x ∈ [0, Lb] ; la plaque extérieure x ∈ [−T, Lb] : elle dépasse de T au début pour recouvrir la tranche
 * du mur précédent. Le mur suivant bute contre la face intérieure dans la zone de fin x ∈ [Lb − T + t, Lb] ; les boulons d'angle
 * y traversent le mur puis le bord de début du suivant, l'écrou se serre dans sa cavité (mur ouvert = plaque extérieure enlevée).
 *
 * Plancher et toit : panneaux (w − 2t) × (d − 2t) posés sur / sous les corps des murs, **entre les plaques extérieures des murs,
 * qui font toute la hauteur H** et recouvrent leurs chants (dehors : six plaques pleines). Leurs boulons, verticaux, traversent
 * le panneau puis le bord haut (ou bas) du mur, au milieu de l'épaisseur du mur, l'écrou dans la cavité du mur. Tout en millimètres.
 */
import { edgeWithTabs, finish, rectPts, RIM_INSET, slotsFor, TAB, type Hole, type Piece, type Pt } from './model';

export interface PanelParams {
  /** Dimensions extérieures du pavé : largeur (façade), profondeur, hauteur. */
  w: number;
  d: number;
  H: number;
  /** Épaisseur du contreplaqué et de la laine de bois. */
  t: number;
  ins: number;
  /** Jeu ajouté aux fentes. */
  fit: number;
  /** Trou d'envol dans la façade (0 = aucun) : diamètre et hauteur du centre depuis le dessus du plancher. */
  hole: number;
  holeHeight: number;
  /** Boulons : diamètre nominal (M3, M4…), nombre par angle vertical, nombre par mur pour le plancher et pour le toit. */
  boltD: number;
  bolts: number;
  capBolts: number;
  /** Largeur de la planche de découpe. */
  sheet: number;
}

export const PANEL_DEFAULTS: PanelParams = { w: 200, d: 200, H: 260, t: 3, ins: 40, fit: 0.1, hole: 0, holeHeight: 140, boltD: 4, bolts: 2, capBolts: 2, sheet: 600 };

/** Un mur : longueur extérieure, nom, trou. */
export interface WallSpec { id: 'A' | 'B' | 'C' | 'D'; name: string; L: number; hole: boolean }

/** Cotes communes : T = épaisseur d'un panneau, h = hauteur des murs (le plancher et le toit prennent 2T), cadre rentré de RIM_INSET. */
export function panelDims(p: PanelParams) {
  const T = 2 * p.t + p.ins;
  return { T, h: p.H - 2 * T, i0: RIM_INSET, boltR: (p.boltD + 0.5) / 2, capW: p.w - 2 * p.t, capD: p.d - 2 * p.t, innerW: p.w - 2 * T + p.t, innerD: p.d - 2 * T + p.t, innerH: p.H - 2 * T };
}

/** Cotes d'un mur de longueur extérieure L : corps Lb, plaque extérieure Lo, cadre c0..c1, abscisse des boulons d'angle. */
export function wallDims(p: PanelParams, L: number) {
  const { T, i0 } = panelDims(p);
  const Lb = L - T - p.t;
  const c0 = i0, c1 = Lb - i0;
  return { Lb, Lo: Lb + T, c0, c1, cavW: c1 - c0, boltX: Lb - (T - p.t) / 2 };
}

/** Hauteurs des boulons d'angle (murs de hauteur h). */
export const boltHeights = (p: PanelParams): number[] => { const { h, i0 } = panelDims(p); return Array.from({ length: p.bolts }, (_, i) => i0 + p.t + ((i + 1) * (h - 2 * i0 - 2 * p.t)) / (p.bolts + 1)); };
/** Abscisses (repère du corps du mur) des boulons du plancher et du toit, répartis le long de la cavité. */
export const capBoltXs = (p: PanelParams, L: number): number[] => { const { c0, cavW } = wallDims(p, L); return Array.from({ length: p.capBolts }, (_, i) => c0 + ((i + 1) * cavW) / (p.capBolts + 1)); };

/** Les 4 murs, en tournant : A façade (largeur w), B côté droit (profondeur d), C arrière (w), D côté gauche (d). */
export const wallsFor = (p: PanelParams): WallSpec[] => [
  { id: 'A', name: 'Façade', L: p.w, hole: p.hole > 0 },
  { id: 'B', name: 'Côté droit', L: p.d, hole: false },
  { id: 'C', name: 'Arrière', L: p.w, hole: false },
  { id: 'D', name: 'Côté gauche', L: p.d, hole: false },
];

/** Fentes du cadre d'une plaque : cadre [c0, c1] × [i0, hgt − i0] dans le repère du corps, décalé de (dx, dy) dans la plaque. */
function frameSlots(p: PanelParams, c0: number, cavW: number, hgt: number, dx: number, dy = 0): Pt[][] {
  const t = p.t, i0 = RIM_INSET, cavH = hgt - 2 * i0;
  return [
    ...slotsFor(c0 + dx, cavW, i0 + dy, Math.min(TAB, cavW / 4), p), ...slotsFor(c0 + dx, cavW, hgt - i0 - t + dy, Math.min(TAB, cavW / 4), p),
    ...slotsFor(i0 + t + dy, cavH - 2 * t, c0 + dx, Math.min(TAB, (cavH - 2 * t) / 4), p, true), ...slotsFor(i0 + t + dy, cavH - 2 * t, c0 + dx + cavW - t, Math.min(TAB, (cavH - 2 * t) / 4), p, true),
  ];
}

/** Bord du cadre : bande de `ins` de haut, tenons en bas et en haut, trous de boulons (abscisse le long du bord). */
function rim(name: string, p: PanelParams, L: number, boltXs: number[] = []): Piece {
  const t = p.t, lt = Math.min(TAB, L / 4), { boltR } = panelDims(p);
  const poly: Pt[] = [...edgeWithTabs([0, 0], [L, 0], [0, -1], lt, t), [L, 0], ...edgeWithTabs([L, p.ins], [0, p.ins], [0, 1], lt, t), [0, p.ins]];
  return finish(name, poly, [], undefined, [], 'ply', boltXs.map((x) => ({ cx: x, cy: p.ins / 2, r: boltR })));
}

/** Les 6 pièces d'un mur : plaque extérieure (plus longue de T, **haute de H** : elle couvre les chants du plancher et du toit ; trous des boulons d'angle de fin), plaque intérieure, bords bas et haut (percés pour plancher / toit), bord de début (percé pour l'angle), bord de fin. */
export function wallPieces(p: PanelParams, s: WallSpec): Piece[] {
  const { T, h, i0, boltR } = panelDims(p);
  const { Lb, Lo, c0, cavW, boltX } = wallDims(p, s.L);
  const t = p.t, pre = `${s.name} : `;
  const bys = boltHeights(p), cxs = capBoltXs(p, s.L);
  const hole: Hole | undefined = s.hole ? { cx: Lb / 2, cy: Math.min(Math.max(p.holeHeight, t + p.hole / 2 + 4), h - t - p.hole / 2 - 4), r: p.hole / 2 } : undefined;
  const plate = (name: string, L: number, dx: number, dy: number, hgt: number) => finish(name, rectPts(0, 0, L, hgt), frameSlots(p, c0, cavW, h, dx, dy), hole && { ...hole, cx: hole.cx + dx, cy: hole.cy + dy }, [], 'ply', bys.map((y) => ({ cx: boltX + dx, cy: y + dy, r: boltR })));
  const vert = h - 2 * i0 - 2 * t;
  return [
    plate(pre + 'plaque extérieure', Lo, T, T, p.H),
    plate(pre + 'plaque intérieure', Lb, 0, 0, h),
    rim(pre + 'bord bas (percé plancher)', p, cavW, cxs.map((x) => x - c0)),
    rim(pre + 'bord haut (percé toit)', p, cavW, cxs.map((x) => x - c0)),
    rim(pre + 'bord de début (percé angle)', p, vert, bys.map((y) => y - i0 - t)),
    rim(pre + 'bord de fin', p, vert),
  ];
}

/**
 * Position des murs dans le pavé (repère monde = repère du mur A) : coin extérieur de départ `C`, direction `u`, normale extérieure `n`.
 * Point local (x, y, z) d'un mur → C + (x + T)·u + (z − T)·n + y·Y.
 */
export function wallFrames(p: PanelParams): { spec: WallSpec; C: [number, number, number]; u: [number, number, number]; n: [number, number, number] }[] {
  const { T } = panelDims(p);
  const [A, B, C, D] = wallsFor(p);
  return [
    { spec: A, C: [-T, 0, T], u: [1, 0, 0], n: [0, 0, 1] },
    { spec: B, C: [p.w - T, 0, T], u: [0, 0, -1], n: [1, 0, 0] },
    { spec: C, C: [p.w - T, 0, T - p.d], u: [-1, 0, 0], n: [0, 0, -1] },
    { spec: D, C: [-T, 0, T - p.d], u: [0, 0, 1], n: [-1, 0, 0] },
  ];
}

/** Trous de boulons du plancher / toit, dans le repère du panneau (X = x monde + T − t, Y = T − t − z monde : 0 devant), au droit du milieu de l'épaisseur des murs. */
export function capBoltHoles(p: PanelParams): Pt[] {
  const { T } = panelDims(p);
  const out: Pt[] = [];
  for (const f of wallFrames(p)) for (const x of capBoltXs(p, f.spec.L)) {
    const wx = f.C[0] + (x + T) * f.u[0] + (T / 2 - T) * f.n[0], wz = f.C[2] + (x + T) * f.u[2] + (T / 2 - T) * f.n[2]; // milieu de l'épaisseur du mur
    out.push([wx + T - p.t, T - p.t - wz]);
  }
  return out;
}

/** Les 6 pièces d'un panneau horizontal (plancher ou toit) : 2 plaques (w − 2t) × (d − 2t) percées pour les boulons, 4 bords. `mirror` : le plancher est vu de dessous, ses trous sont en miroir. */
export function capPieces(p: PanelParams, name: string, mirror: boolean): Piece[] {
  const { i0, boltR, capW: W, capD: D } = panelDims(p);
  const t = p.t, pre = `${name} : `;
  const cavW = W - 2 * i0, cavH = D - 2 * i0;
  const holes = capBoltHoles(p).map(([X, Y]) => ({ cx: mirror ? W - X : X, cy: Y, r: boltR }));
  const plate = (n: string) => finish(n, rectPts(0, 0, W, D), frameSlots(p, i0, cavW, D, 0), undefined, [], 'ply', holes);
  return [
    plate(pre + 'plaque extérieure'),
    plate(pre + 'plaque intérieure'),
    rim(pre + 'bord avant / arrière', p, cavW),
    rim(pre + 'bord avant / arrière', p, cavW),
    rim(pre + 'bord latéral', p, cavH - 2 * t),
    rim(pre + 'bord latéral', p, cavH - 2 * t),
  ];
}

/** Toutes les pièces du pavé. */
export function panelPieces(p: PanelParams): Piece[] {
  return [...wallsFor(p).flatMap((s) => wallPieces(p, s)), ...capPieces(p, 'Plancher', true), ...capPieces(p, 'Toit', false)];
}

export interface Placed { piece: Piece; x: number; y: number; label: string }

/** Rangement en étagères sur une planche de largeur `sheet`. */
export function panelLayout(p: PanelParams, gap = 6): { placed: Placed[]; height: number } {
  const items = panelPieces(p).map((piece) => ({ piece, label: piece.name }));
  items.sort((a, b) => b.piece.h - a.piece.h);
  const placed: Placed[] = [];
  let x = gap, y = gap, row = 0;
  for (const it of items) {
    if (x + it.piece.w + gap > p.sheet && x > gap) { x = gap; y += row + gap; row = 0; }
    placed.push({ ...it, x, y });
    x += it.piece.w + gap;
    row = Math.max(row, it.piece.h);
  }
  return { placed, height: y + row + gap };
}

const f = (n: number) => +n.toFixed(2);

/** SVG à l'échelle réelle : noir 0,1 mm = coupe (contours, trous, fentes), bleu = nom. */
export function panelSvg(p: PanelParams): string {
  const { placed, height } = panelLayout(p);
  const parts = placed.map(({ piece, x, y, label }) => {
    const px = (a: number) => f(x + a - piece.min[0]);
    const py = (b: number) => f(y + piece.h - (b - piece.min[1]));
    const poly = (pts: Pt[]) => `<polygon points="${pts.map(([a, b]) => `${px(a)},${py(b)}`).join(' ')}" fill="none" stroke="#000" stroke-width="0.1"/>`;
    const holes = [...(piece.hole ? [piece.hole] : []), ...piece.holes].map((h) => `<circle cx="${px(h.cx)}" cy="${py(h.cy)}" r="${f(h.r)}" fill="none" stroke="#000" stroke-width="0.1"/>`).join('');
    const text = `<text x="${f(x + piece.w / 2)}" y="${f(y + piece.h / 2)}" font-size="5" text-anchor="middle" fill="#00f" font-family="sans-serif">${label}</text>`;
    return poly(piece.poly) + piece.slots.map(poly).join('') + holes + text;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${p.sheet}mm" height="${f(height)}mm" viewBox="0 0 ${p.sheet} ${f(height)}">${parts.join('')}</svg>`;
}
