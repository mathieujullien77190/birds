/**
 * Nichoir isolé en contreplaqué emboîté (sans vis), tout en millimètres :
 * - parois : une boîte extérieure et une boîte intérieure, séparées d'un vide de `ins` mm rempli de laine de bois ;
 * - toit : un caisson (plaque basse, 4 bords de `ins` de haut, plaque haute) rempli de laine de bois, couvert d'une tôle pliée ;
 * - plancher : une plaque simple (le nid isole).
 * Coins verticaux : assemblage à doigts. Plancher : tenons à travers les parois extérieures, fentes pour les tenons du bas
 * des parois intérieures. Plaque basse du toit : fentes pour les tenons de la pente des côtés (extérieurs et intérieurs)
 * et pour les bords du caisson ; plaque haute : fentes pour les bords du caisson.
 */

export interface HouseParams {
  /** Largeur et profondeur intérieures (de la boîte intérieure). */
  w: number;
  d: number;
  /** Hauteur intérieure à l'avant (du plancher au haut de la face avant extérieure) ; l'arrière est plus haut de `rise` : le toit descend vers l'avant. */
  hf: number;
  rise: number;
  /** Épaisseur du contreplaqué. */
  t: number;
  /** Épaisseur de l'isolant (laine de bois) : vide entre les deux parois, et hauteur du caisson du toit. */
  ins: number;
  /** Débord du toit (devant, derrière, de chaque côté). */
  overhang: number;
  /** Diamètre du trou d'envol et hauteur de son centre au-dessus du plancher. */
  hole: number;
  holeHeight: number;
  /** Jeu ajouté aux fentes pour que les tenons rentrent (le trait de laser en mange déjà un peu). */
  fit: number;
  /** Largeur de la planche de découpe. */
  sheet: number;
  /** Tôle pliée sur le toit : rabat replié vers le bas sur chaque côté (0 = pas de tôle) et épaisseur. */
  metalFold: number;
  metalT: number;
}

export interface Preset { id: string; label: string; params: Pick<HouseParams, 'w' | 'd' | 'hf' | 'hole' | 'holeHeight'>; note: string }

/** Valeurs usuelles des guides de pose, à prendre comme point de départ. */
export const PRESETS: Preset[] = [
  { id: 'bluetit', label: 'Mésange bleue', params: { w: 100, d: 100, hf: 200, hole: 28, holeHeight: 140 }, note: 'Trou de 26 à 28 mm : assez petit pour écarter les moineaux.' },
  { id: 'greattit', label: 'Mésange charbonnière', params: { w: 120, d: 120, hf: 220, hole: 32, holeHeight: 150 }, note: "Trou de 32 mm, fond d'au moins 12 × 12 cm." },
  { id: 'coaltit', label: 'Mésange noire / nonnette', params: { w: 100, d: 100, hf: 200, hole: 26, holeHeight: 140 }, note: 'Trou de 26 mm, à poser plutôt bas ; la nonnette aime les troncs.' },
];

export const DEFAULTS: HouseParams = { ...PRESETS[0].params, t: 3, ins: 40, overhang: 25, rise: 40, fit: 0.1, sheet: 600, metalFold: 15, metalT: 0.5 };

export type Pt = [number, number];

export interface Hole { cx: number; cy: number; r: number }

export interface Piece {
  name: string;
  /** Contour fermé en mm, y vers le haut (repère propre à la pièce). */
  poly: Pt[];
  /** Trou d'envol. */
  hole?: Hole;
  /** Autres trous ronds (boulons). */
  holes: Hole[];
  /** Fentes rectangulaires où entrent les tenons des autres pièces. */
  slots: Pt[][];
  /** Lignes à graver (plis de la tôle). */
  lines: Pt[][];
  material: 'ply' | 'metal';
  /** Boîte englobante du contour. */
  min: Pt;
  w: number;
  h: number;
}

/** Plancher relevé : les parois extérieures dépassent dessous (pieds, le sol ne ronge pas le plancher). */
export const LIFT = 8;
export const TAB = 24;
/** Les bords d'un caisson (toit, mur isolé) sont rentrés d'autant par rapport au bord des plaques : une fente au ras du bord casserait la face (et sa triangulation). */
export const RIM_INSET = 2;
const TAB_AT = [0.3, 0.7];
/** Les parois intérieures s'arrêtent un peu sous le toit pour ne pas le soulever. */
const GAP = 0.6;

/** Cotes générales. Extérieur : W × D au sol, HF devant / HB derrière. Boîte intérieure : Wi × Di, rentrée de `off` = t + ins. Toit : plaques roofW × roofL, caisson de `roofH` = 2t + ins de haut. */
export function outer(p: HouseParams) {
  const off = p.t + p.ins;
  const Wi = p.w + 2 * p.t, Di = p.d + 2 * p.t;
  const W = Wi + 2 * off, D = Di + 2 * off;
  const HF = LIFT + p.t + p.hf, HB = HF + p.rise;
  const slopeLen = Math.hypot(D, p.rise);
  /** Hauteur du dessous du toit à `s` mm de la face avant extérieure. */
  const roofAt = (s: number) => HF + (p.rise * s) / D;
  return { off, Wi, Di, W, D, HF, HB, slope: Math.atan2(p.rise, D), slopeLen, roofAt, roofW: W + 2 * p.overhang, roofL: slopeLen + 2 * p.overhang, roofH: 2 * p.t + p.ins };
}

export const rectPts = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

/** Nombre impair de doigts pour une arête de longueur `len`. */
export const fingers = (len: number): number => { const n = Math.max(3, Math.round(len / 14)); return n % 2 === 0 ? n + 1 : n; };

/** Un seul contour avec ses fentes : boîte englobante calculée. */
export function finish(name: string, poly: Pt[], slots: Pt[][] = [], hole?: Piece['hole'], lines: Pt[][] = [], material: Piece['material'] = 'ply', holes: Hole[] = []): Piece {
  const xs = poly.map((q) => q[0]), ys = poly.map((q) => q[1]);
  const min: Pt = [Math.min(...xs), Math.min(...ys)];
  return { name, poly, slots, hole, holes, lines, material, min, w: Math.max(...xs) - min[0], h: Math.max(...ys) - min[1] };
}

/** Tous les trous ronds d'une pièce (trou d'envol compris). */
export const allHoles = (piece: Piece): Hole[] => (piece.hole ? [piece.hole, ...piece.holes] : piece.holes);

/** Un bord droit de a à b (b exclu) avec deux tenons de longueur `lt` (à 30 % et 70 %) qui dépassent de `t` du côté `out`. */
export function edgeWithTabs(a: Pt, b: Pt, out: Pt, lt: number, t: number): Pt[] {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const d: Pt = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  const at = (s: number, o: number): Pt => [a[0] + d[0] * s + out[0] * o, a[1] + d[1] * s + out[1] * o];
  const pts: Pt[] = [a];
  for (const f of TAB_AT) { const s0 = f * L - lt / 2; pts.push(at(s0, 0), at(s0, t), at(s0 + lt, t), at(s0 + lt, 0)); }
  return pts;
}

/** Les deux fentes (dans la pièce d'en face) pour les tenons d'un bord de longueur L qui commence en `x0` ; fente de `t` d'épaisseur à partir de `y0`. `vertical` : le bord est le long de y, la fente est à x = y0. */
export function slotsFor(x0: number, L: number, y0: number, lt: number, p: { t: number; fit: number }, vertical = false): Pt[][] {
  const s = p.fit;
  return TAB_AT.map((f) => (vertical ? rectPts(y0 - s / 2, x0 + f * L - lt / 2 - s / 2, p.t + s, lt + s) : rectPts(x0 + f * L - lt / 2 - s / 2, y0 - s / 2, lt + s, p.t + s)));
}

/**
 * Face avant ou arrière : largeur `Wd`, doigts sur les deux bords verticaux (la face possède les doigts de rang pair), haut plat à `H`.
 * Extérieure : fentes pour les tenons du plancher. Intérieure (`inner`) : tenons en bas, vers le plancher.
 */
function wallPanel(name: string, p: HouseParams, Wd: number, H: number, inner: boolean, hole?: Piece['hole']): Piece {
  const t = p.t, n = fingers(H);
  const y = (i: number) => (i * H) / n;
  const lt = Math.min(TAB, (Wd - 2 * t) / 3);
  const poly: Pt[] = [];
  if (inner) poly.push(...edgeWithTabs([0, 0], [Wd, 0], [0, -1], lt, t));
  for (let i = 0; i < n; i++) { const x = i % 2 === 0 ? Wd : Wd - t; poly.push([x, y(i)], [x, y(i + 1)]); }
  for (let i = n - 1; i >= 0; i--) { const x = i % 2 === 0 ? 0 : t; poly.push([x, y(i + 1)], [x, y(i)]); }
  const slots = inner ? [] : slotsFor(0, Wd, LIFT, lt, p);
  return finish(name, poly, slots, hole);
}

/**
 * Côté : profondeur `Dd`, bord avant de hauteur `hFront`, bord arrière `hBack`, pente entre les deux avec des tenons vers le toit ;
 * doigts complémentaires de ceux des faces (le côté possède les doigts de rang impair). Extérieur : fentes du plancher ; intérieur : tenons en bas.
 */
function sidePanel(name: string, p: HouseParams, Dd: number, hFront: number, hBack: number, inner: boolean): Piece {
  const t = p.t;
  const top = (x: number) => hFront + ((hBack - hFront) * x) / Dd;
  const nf = fingers(hFront), nb = fingers(hBack);
  const poly: Pt[] = [];
  for (let i = 0; i < nb; i++) { // arête arrière, de bas en haut
    const x = i % 2 === 1 ? Dd : Dd - t;
    poly.push([x, (i * hBack) / nb], [x, i === nb - 1 ? top(x) : ((i + 1) * hBack) / nb]);
  }
  const L = Math.hypot(Dd, hBack - hFront);
  const nrm: Pt = [-(hBack - hFront) / L, Dd / L];
  const lt = Math.min(TAB, L / 4);
  const slope = edgeWithTabs([0, hFront], [Dd, hBack], nrm, lt, t); // de l'avant vers l'arrière
  for (let i = slope.length - 1; i >= 1; i--) poly.push(slope[i]);
  for (let i = nf - 1; i >= 0; i--) { // arête avant, de haut en bas
    const x = i % 2 === 1 ? 0 : t;
    poly.push([x, i === nf - 1 ? top(x) : ((i + 1) * hFront) / nf], [x, (i * hFront) / nf]);
  }
  const ltFloor = Math.min(TAB, (Dd - 2 * t) / 3);
  if (inner) poly.push(...edgeWithTabs([t, 0], [Dd - t, 0], [0, -1], ltFloor, t));
  const slots = inner ? [] : slotsFor(t, Dd - 2 * t, LIFT, ltFloor, p);
  return finish(name, poly, slots);
}

/** Plancher : le rectangle entre les parois extérieures plus des tenons qui les traversent ; fentes pour les tenons du bas des parois intérieures. */
function floorPanel(p: HouseParams): Piece {
  const { W, D, Wi, Di, off } = outer(p);
  const t = p.t;
  const ltW = Math.min(TAB, (W - 2 * t) / 3), ltD = Math.min(TAB, (D - 2 * t) / 3);
  const poly: Pt[] = [
    ...edgeWithTabs([t, t], [W - t, t], [0, -1], ltW, t),
    ...edgeWithTabs([W - t, t], [W - t, D - t], [1, 0], ltD, t),
    ...edgeWithTabs([W - t, D - t], [t, D - t], [0, 1], ltW, t),
    ...edgeWithTabs([t, D - t], [t, t], [-1, 0], ltD, t),
  ];
  const ltWi = Math.min(TAB, (Wi - 2 * t) / 3), ltDi = Math.min(TAB, (Di - 2 * t) / 3);
  const slots = [
    ...slotsFor(off, Wi, off, ltWi, p), // face avant intérieure
    ...slotsFor(off, Wi, D - off - t, ltWi, p), // face arrière intérieure
    ...slotsFor(off + t, Di - 2 * t, off, ltDi, p, true), // côté intérieur gauche
    ...slotsFor(off + t, Di - 2 * t, W - off - t, ltDi, p, true), // côté intérieur droit
  ];
  return finish('Plancher', poly, slots);
}

/** Fentes des 4 bords du caisson du toit dans une plaque roofW × roofL, rentrées de RIM_INSET (bords avant / arrière pleine largeur, latéraux entre les deux). */
function rimSlots(p: HouseParams): Pt[][] {
  const { roofW, roofL } = outer(p);
  const t = p.t, i = RIM_INSET;
  const LW = roofW - 2 * i, LL = roofL - 2 * i - 2 * t;
  const ltW = Math.min(TAB, LW / 4), ltL = Math.min(TAB, LL / 4);
  return [
    ...slotsFor(i, LW, i, ltW, p), ...slotsFor(i, LW, roofL - i - t, ltW, p),
    ...slotsFor(i + t, LL, i, ltL, p, true), ...slotsFor(i + t, LL, roofW - i - t, ltL, p, true),
  ];
}

/** Plaque basse du toit : couchée sur la pente ; fentes pour les tenons des côtés extérieurs et intérieurs, et pour les bords du caisson. */
function roofLow(p: HouseParams): Piece {
  const { roofW, roofL, slopeLen, D, Wi, off, Di } = outer(p);
  const o = p.overhang, t = p.t;
  const slots: Pt[][] = rimSlots(p);
  const lt = Math.min(TAB, slopeLen / 4);
  for (const x of [o, roofW - o - t]) slots.push(...slotsFor(o, slopeLen, x, lt, p, true));
  const k = slopeLen / D; // mm le long de la pente par mm horizontal
  const Li = Di * k, lti = Math.min(TAB, Li / 4);
  for (const x of [o + off, o + off + Wi - t]) slots.push(...slotsFor(o + off * k, Li, x, lti, p, true));
  return finish('Toit : plaque basse', rectPts(0, 0, roofW, roofL), slots);
}

/** Plaque haute du toit : fentes pour les bords du caisson. */
function roofHigh(p: HouseParams): Piece {
  const { roofW, roofL } = outer(p);
  return finish('Toit : plaque haute', rectPts(0, 0, roofW, roofL), rimSlots(p));
}

/** Bord du caisson du toit : bande de `ins` de haut, tenons en bas (plaque basse) et en haut (plaque haute). */
function rimPanel(name: string, p: HouseParams, L: number): Piece {
  const t = p.t, lt = Math.min(TAB, L / 4);
  const poly: Pt[] = [...edgeWithTabs([0, 0], [L, 0], [0, -1], lt, t), [L, 0], ...edgeWithTabs([L, p.ins], [0, p.ins], [0, 1], lt, t), [0, p.ins]];
  return finish(name, poly);
}

/** Tôle du toit : la plaque haute plus un rabat de `metalFold` sur chaque côté, coins échancrés ; plis à graver. */
function metalSheet(p: HouseParams): Piece {
  const { roofW, roofL } = outer(p);
  const f = p.metalFold;
  const poly: Pt[] = [
    [f, 0], [f + roofW, 0], [f + roofW, f], [2 * f + roofW, f], [2 * f + roofW, f + roofL], [f + roofW, f + roofL],
    [f + roofW, 2 * f + roofL], [f, 2 * f + roofL], [f, f + roofL], [0, f + roofL], [0, f], [f, f],
  ];
  const lines: Pt[][] = [[[f, f], [f + roofW, f]], [[f + roofW, f], [f + roofW, f + roofL]], [[f + roofW, f + roofL], [f, f + roofL]], [[f, f + roofL], [f, f]]];
  return finish(`Tôle de toit (${p.metalT} mm)`, poly, [], undefined, lines, 'metal');
}

/** Hauteurs utiles pour les parois intérieures (repère local : y = 0 sur le dessus du plancher). */
export function innerHeights(p: HouseParams) {
  const { D, off, roofAt } = outer(p);
  const base = LIFT + p.t;
  return {
    base,
    front: roofAt(off) - GAP - base, // face avant intérieure : jusqu'au dessous du toit à sa face avant
    back: roofAt(D - off - p.t) - GAP - base, // face arrière intérieure : idem à sa face avant (la plus basse)
    sideBack: roofAt(D - off) - GAP - base, // bord arrière des côtés intérieurs
  };
}

/** Les pièces, chacune avec sa quantité. */
export function pieces(p: HouseParams): { piece: Piece; qty: number }[] {
  const { W, D, Wi, Di, HF, HB, roofW, roofL } = outer(p);
  const h = innerHeights(p);
  const hy = Math.min(h.base + p.holeHeight, HF - p.hole / 2 - 5);
  const hole = (cx: number, cy: number) => ({ cx, cy, r: p.hole / 2 });
  return [
    { piece: floorPanel(p), qty: 1 },
    { piece: wallPanel('Face avant extérieure', p, W, HF, false, hole(W / 2, hy)), qty: 1 },
    { piece: wallPanel('Face arrière extérieure', p, W, HB, false), qty: 1 },
    { piece: sidePanel('Côté extérieur', p, D, HF, HB, false), qty: 2 },
    { piece: wallPanel('Face avant intérieure', p, Wi, h.front, true, hole(Wi / 2, hy - h.base)), qty: 1 },
    { piece: wallPanel('Face arrière intérieure', p, Wi, h.back, true), qty: 1 },
    { piece: sidePanel('Côté intérieur', p, Di, h.front, h.sideBack, true), qty: 2 },
    { piece: roofLow(p), qty: 1 },
    { piece: rimPanel('Toit : bord avant / arrière', p, roofW - 2 * RIM_INSET), qty: 2 },
    { piece: rimPanel('Toit : bord latéral', p, roofL - 2 * RIM_INSET - 2 * p.t), qty: 2 },
    { piece: roofHigh(p), qty: 1 },
    ...(p.metalFold > 0 ? [{ piece: metalSheet(p), qty: 1 }] : []),
  ];
}

export interface Placed { piece: Piece; x: number; y: number; label: string }

/** Range les pièces d'un matériau en étagères sur une planche de largeur `sheet` ; renvoie les positions et la hauteur utilisée. */
export function layout(p: HouseParams, material: Piece['material'] = 'ply', gap = 6): { placed: Placed[]; height: number } {
  const items: { piece: Piece; label: string }[] = [];
  for (const { piece, qty } of pieces(p)) if (piece.material === material) for (let i = 0; i < qty; i++) items.push({ piece, label: qty > 1 ? `${piece.name} ${i + 1}` : piece.name });
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

/** SVG à l'échelle réelle (1 unité = 1 mm) : noir 0,1 mm = coupe (contour, trou, fentes), bleu = plis à graver et nom de la pièce. */
export function houseSvg(p: HouseParams, material: Piece['material'] = 'ply'): string {
  const { placed, height } = layout(p, material);
  const width = material === 'ply' ? p.sheet : Math.max(...placed.map((q) => q.x + q.piece.w)) + 6;
  const parts = placed.map(({ piece, x, y, label }) => {
    const px = (a: number) => f(x + a - piece.min[0]);
    const py = (b: number) => f(y + piece.h - (b - piece.min[1])); // y du SVG vers le bas
    const poly = (pts: Pt[]) => `<polygon points="${pts.map(([a, b]) => `${px(a)},${py(b)}`).join(' ')}" fill="none" stroke="#000" stroke-width="0.1"/>`;
    const line = (pts: Pt[]) => `<polyline points="${pts.map(([a, b]) => `${px(a)},${py(b)}`).join(' ')}" fill="none" stroke="#00f" stroke-width="0.1"/>`;
    const hole = allHoles(piece).map((h) => `<circle cx="${px(h.cx)}" cy="${py(h.cy)}" r="${f(h.r)}" fill="none" stroke="#000" stroke-width="0.1"/>`).join('');
    const text = `<text x="${f(x + piece.w / 2)}" y="${f(y + piece.h / 2)}" font-size="6" text-anchor="middle" fill="#00f" font-family="sans-serif">${label}</text>`;
    return poly(piece.poly) + piece.slots.map(poly).join('') + piece.lines.map(line).join('') + hole + text;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${f(width)}mm" height="${f(height)}mm" viewBox="0 0 ${f(width)} ${f(height)}">${parts.join('')}</svg>`;
}

/** Une pièce seule en SVG (pour la liste des pièces) : contour, fentes, plis et trou, à l'échelle `scale` px/mm, marge de 4 mm. */
export function pieceSvg(piece: Piece, scale: number): string {
  const M = 4;
  const px = (a: number) => f((a - piece.min[0] + M) * scale);
  const py = (b: number) => f((piece.h - (b - piece.min[1]) + M) * scale); // y vers le bas
  const pts = (q: Pt[]) => q.map(([a, b]) => `${px(a)},${py(b)}`).join(' ');
  const poly = (q: Pt[], stroke: string) => `<polygon points="${pts(q)}" fill="none" stroke="${stroke}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  const line = (q: Pt[]) => `<polyline points="${pts(q)}" fill="none" stroke="#2563eb" stroke-width="1" stroke-dasharray="4 3"/>`;
  const w = f((piece.w + 2 * M) * scale), h = f((piece.h + 2 * M) * scale);
  const hole = allHoles(piece).map((h) => `<circle cx="${px(h.cx)}" cy="${py(h.cy)}" r="${f(h.r * scale)}" fill="none" stroke="#111" stroke-width="1"/>`).join('');
  const fill = piece.material === 'metal' ? '#e5e7eb' : '#f5ead8';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polygon points="${pts(piece.poly)}" fill="${fill}" stroke="none"/>${poly(piece.poly, '#111')}${piece.slots.map((s) => poly(s, '#b45309')).join('')}${piece.lines.map(line).join('')}${hole}</svg>`;
}
