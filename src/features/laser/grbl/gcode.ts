import type { NestSheet } from '@/planks/model';

/**
 * Génération du G-code pour une planche de `nestSheets`. Fonctions pures (sans React ni DOM).
 *
 * CONVENTION D'AXES : l'origine de travail (X0 Y0, système G54) est le coin BAS-GAUCHE de la planche vu de dessus,
 * X vers la droite, Y vers l'ARRIÈRE de la machine. Le SVG de l'app a l'origine en HAUT à gauche avec y vers le bas :
 * Ymachine = H − ySVG. Le G-code est donc l'image du SVG « posé tel quel » sur le plateau, la façade de la machine vers le bas de l'écran.
 */

/** Zone de travail de la Sculpfun S30 Pro (mm). */
export const MACHINE_AREA = { W: 410, H: 400 } as const;

export type PassMode = 'all' | 'contour';

export interface CutOptions {
  /** Taille de la planche (mm). */
  W: number;
  H: number;
  /** Vitesse de coupe (mm/min). */
  feed: number;
  /** Puissance demandée (% de S max). */
  powerPct: number;
  /** Nombre de passes (≥ 1). */
  passes: number;
  /** `all` : tout le jeu de contours puis on recommence ; `contour` : chaque contour est répété avant de passer au suivant. */
  passMode: PassMode;
  /** Valeur `$30` de la machine (S max). */
  sMax: number;
  /** Plafond de puissance (%). */
  capPct: number;
  /** Vitesse des déplacements rapides, pour l'estimation du temps (mm/min). */
  rapidFeed?: number;
}

export interface Segment { x0: number; y0: number; x1: number; y1: number; cut: boolean }

export interface GcodeStats {
  /** Contours distincts (pièces + trous). */
  contours: number;
  /** Nombre de lignes envoyées. */
  lines: number;
  /** Longueur coupée, passes comprises (mm). */
  cutMm: number;
  rapidMm: number;
  /** Durée estimée (s). */
  seconds: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  /** Une partie du tracé sort de la planche. */
  outOfBounds: boolean;
  /** Plus grande valeur S écrite. */
  maxS: number;
  /** Puissance demandée écrêtée par le plafond ou par S max. */
  clamped: boolean;
}

export interface GcodeJob {
  /** Lignes à envoyer (propres : sans commentaire ni ligne vide). */
  lines: string[];
  /** Commentaires d'en-tête, pour le fichier téléchargé. */
  header: string[];
  /** Tracé de la première passe, pour l'aperçu. */
  segments: Segment[];
  /** Temps cumulé (s) à la fin de chaque ligne. */
  lineTimes: number[];
  stats: GcodeStats;
}

export const DEFAULT_RAPID = 6000;

/** Retire commentaires (`;…` et `(…)`) et espaces superflus. */
export function cleanLine(line: string): string {
  return line.replace(/\(.*?\)/g, '').replace(/;.*$/, '').trim().replace(/\s+/g, ' ');
}

/** Valeur S pour une puissance en % : jamais au-dessus du plafond ni de S max. */
export function powerToS(powerPct: number, sMax: number, capPct: number): number {
  const pct = Math.max(0, Math.min(powerPct, capPct, 100));
  return Math.max(0, Math.min(sMax, Math.round((pct / 100) * sMax)));
}

const num = (v: number): string => (Math.round(v * 1000) / 1000).toString().replace(/^-0$/, '0');

/** Aire signée d'un polygone (formule des lacets). */
function area(pts: [number, number][]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return Math.abs(a) / 2;
}

/** Contour en segments droits : points doubles et alignés retirés, point de fermeture répété retiré. */
export function simplifyContour(pts: [number, number][], tol = 0.005): [number, number][] {
  let p = pts.filter((q, i) => i === 0 || Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) > 1e-6);
  if (p.length > 1 && Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) < 1e-6) p = p.slice(0, -1);
  let changed = true;
  while (changed && p.length > 3) {
    changed = false;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length];
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
      if (Math.abs(cross) / len < tol && (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) >= 0) { p = p.filter((_, k) => k !== i); changed = true; break; }
    }
  }
  return p;
}

/** Un contour à couper, en coordonnées machine (mm, origine bas-gauche). */
export interface Contour { pts: [number, number][]; hole: boolean; area: number; piece: string }

/**
 * Contours d'une planche dans l'ordre de coupe : pièces des plus petites aux plus grandes (une petite pièce rangée dans le creux d'une grande
 * est coupée avant que le creux ne soit libéré), et pour chaque pièce ses trous AVANT son contour extérieur (la pièce tient jusqu'au bout).
 */
export function sheetContours(sheet: NestSheet, H: number): Contour[] {
  const pieces = sheet.items.map((it) => {
    const conv = (pts: [number, number][]): [number, number][] => simplifyContour(pts.map(([a, b]): [number, number] => [it.x + a, H - (it.y + it.h - b)]));
    const outer = conv(it.poly);
    const holes = it.holes.map(conv).filter((h) => h.length >= 3).sort((a, b) => area(a) - area(b));
    return { name: it.plank.name, outer, holes, area: area(outer) };
  }).sort((a, b) => a.area - b.area);
  const out: Contour[] = [];
  for (const p of pieces) {
    for (const h of p.holes) out.push({ pts: h, hole: true, area: area(h), piece: p.name });
    if (p.outer.length >= 3) out.push({ pts: p.outer, hole: false, area: p.area, piece: p.name });
  }
  return out;
}

/** Écrit les lignes de G-code en suivant la position, le temps, le tracé et les statistiques. */
class Writer {
  lines: string[] = [];
  lineTimes: number[] = [];
  segments: Segment[] = [];
  x = 0; y = 0;
  t = 0;
  cutMm = 0; rapidMm = 0; maxS = 0;
  minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
  constructor(private rapidFeed: number, private W: number, private H: number) {}
  raw(line: string, dt = 0) { this.lines.push(line); this.t += dt; this.lineTimes.push(this.t); }
  private bound(x: number, y: number) { this.minX = Math.min(this.minX, x); this.minY = Math.min(this.minY, y); this.maxX = Math.max(this.maxX, x); this.maxY = Math.max(this.maxY, y); }
  /** Déplacement rapide (laser éteint : G0 en mode laser). Rien si on y est déjà. */
  rapid(x: number, y: number, record: boolean) {
    if (Math.abs(x - this.x) < 1e-6 && Math.abs(y - this.y) < 1e-6) return;
    const d = Math.hypot(x - this.x, y - this.y);
    this.raw(`G0 X${num(x)} Y${num(y)}`, (d / this.rapidFeed) * 60);
    this.rapidMm += d;
    if (record) this.segments.push({ x0: this.x, y0: this.y, x1: x, y1: y, cut: false });
    this.x = x; this.y = y;
  }
  /** Coupe un contour fermé : part du premier point, revient au premier point. */
  cut(pts: [number, number][], feed: number, s: number, record: boolean) {
    this.rapid(pts[0][0], pts[0][1], record);
    this.bound(pts[0][0], pts[0][1]);
    const seq = [...pts.slice(1), pts[0]];
    seq.forEach(([x, y], i) => {
      const d = Math.hypot(x - this.x, y - this.y);
      this.raw(i === 0 ? `G1 X${num(x)} Y${num(y)} F${num(feed)} S${s}` : `G1 X${num(x)} Y${num(y)}`, (d / feed) * 60);
      this.cutMm += d;
      this.maxS = Math.max(this.maxS, s);
      this.bound(x, y);
      if (record) this.segments.push({ x0: this.x, y0: this.y, x1: x, y1: y, cut: true });
      this.x = x; this.y = y;
    });
  }
  stats(contours: number, clamped: boolean): GcodeStats {
    const has = Number.isFinite(this.minX);
    const eps = 1e-6;
    return {
      contours, lines: this.lines.length, cutMm: this.cutMm, rapidMm: this.rapidMm, seconds: this.t,
      bounds: has ? { minX: this.minX, minY: this.minY, maxX: this.maxX, maxY: this.maxY } : null,
      outOfBounds: has && (this.minX < -eps || this.minY < -eps || this.maxX > this.W + eps || this.maxY > this.H + eps),
      maxS: this.maxS, clamped,
    };
  }
}

/** Début commun : unités mm, absolu, système G54, mode laser dynamique à puissance 0 (rien ne brûle avant le premier G1). */
function prologue(w: Writer) {
  w.raw('G21');
  w.raw('G90');
  w.raw('G54');
  w.raw('G94');
  w.raw('M5');
  w.raw('M4 S0');
}

/** Fin commune : laser éteint, retour à l'origine de travail, `M5` en dernière ligne. */
function epilogue(w: Writer) {
  w.raw('M5');
  w.rapid(0, 0, true);
  w.raw('M5');
}

/** Coupe des contours selon le mode de passes. */
function emitContours(w: Writer, contours: Contour[], o: { feed: number; s: number; passes: number; passMode: PassMode }) {
  const passes = Math.max(1, Math.round(o.passes));
  if (o.passMode === 'contour') {
    for (const c of contours) for (let p = 0; p < passes; p++) w.cut(c.pts, o.feed, o.s, p === 0);
  } else {
    for (let p = 0; p < passes; p++) for (const c of contours) w.cut(c.pts, o.feed, o.s, p === 0);
  }
}

/** G-code de coupe d'une planche : trous avant contour extérieur, passes, `M5` final et retour à l'origine. */
export function buildGcode(sheet: NestSheet, opt: CutOptions): GcodeJob {
  const w = new Writer(opt.rapidFeed ?? DEFAULT_RAPID, opt.W, opt.H);
  const contours = sheetContours(sheet, opt.H);
  const s = powerToS(opt.powerPct, opt.sMax, opt.capPct);
  const feed = Math.max(1, opt.feed);
  const clamped = opt.powerPct > opt.capPct || opt.powerPct > 100;
  prologue(w);
  emitContours(w, contours, { feed, s, passes: opt.passes, passMode: opt.passMode });
  epilogue(w);
  const stats = w.stats(contours.length, clamped);
  return {
    lines: w.lines, lineTimes: w.lineTimes, segments: w.segments, stats,
    header: [
      'Nichoir mésange — découpe laser (Sculpfun S30 Pro, GRBL 1.1)',
      `Planche ${opt.W} x ${opt.H} mm ; origine de travail = coin bas-gauche, X à droite, Y vers l'arrière`,
      `${contours.length} contours, ${Math.max(1, Math.round(opt.passes))} passe(s) (${opt.passMode === 'all' ? 'tout le jeu' : 'contour par contour'}), F${num(feed)} mm/min, S${s}/${opt.sMax}`,
      'Les noms des pièces ne sont pas gravés.',
    ],
  };
}

/** Rectangle à suivre pour le cadre. */
export interface FrameBox { minX: number; minY: number; maxX: number; maxY: number }

/** Rectangle englobant les pièces d'une planche, en coordonnées machine. */
export function sheetBox(sheet: NestSheet, H: number): FrameBox | null {
  if (!sheet.items.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const it of sheet.items) { minX = Math.min(minX, it.x); maxX = Math.max(maxX, it.x + it.w); minY = Math.min(minY, H - (it.y + it.h)); maxY = Math.max(maxY, H - it.y); }
  return { minX, minY, maxX, maxY };
}

/**
 * Cadre à vide : le rectangle suivi par des commandes de déplacement `$J=` (jog) qui n'allument JAMAIS le laser, précédées de `M5`.
 * Il n'y a donc aucune valeur S positive dans ce programme.
 */
export function buildFrame(box: FrameBox, feed = 3000): GcodeJob {
  const w = new Writer(feed, Infinity, Infinity);
  const go = (x: number, y: number) => {
    const d = Math.hypot(x - w.x, y - w.y);
    w.raw(`$J=G90 G21 X${num(x)} Y${num(y)} F${num(feed)}`, (d / feed) * 60);
    w.rapidMm += d;
    w.segments.push({ x0: w.x, y0: w.y, x1: x, y1: y, cut: false });
    w.x = x; w.y = y;
  };
  w.raw('M5');
  go(box.minX, box.minY);
  go(box.maxX, box.minY);
  go(box.maxX, box.maxY);
  go(box.minX, box.maxY);
  go(box.minX, box.minY);
  go(0, 0);
  const stats = w.stats(0, false);
  stats.bounds = { ...box };
  return { lines: w.lines, lineTimes: w.lineTimes, segments: w.segments, stats, header: ['Cadre à vide : laser éteint (M5), déplacements $J= uniquement'] };
}

export interface TestCardOptions {
  W: number; H: number;
  speeds: number[];
  powers: number[];
  /** Côté d'un carré (mm). */
  size: number;
  /** Espace entre carrés (mm). */
  gap: number;
  passes: number;
  sMax: number;
  capPct: number;
  rapidFeed?: number;
}

export interface TestCell { speed: number; power: number; s: number; x: number; y: number; clamped: boolean }

export interface TestCardResult { job: GcodeJob; cells: TestCell[]; fits: boolean }

/** Marge entre le bord de la planche et la grille d'essai (mm). */
export const TEST_MARGIN = 5;

/**
 * Planche d'essai : un petit carré découpé par couple (vitesse, puissance). Colonnes = vitesses, lignes = puissances (de bas en haut, en
 * partant de l'origine). Coordonnées (x, y) = coin bas-gauche de chaque carré, dans le repère de travail. Rien n'est gravé.
 */
export function buildTestCard(o: TestCardOptions): TestCardResult {
  const w = new Writer(o.rapidFeed ?? DEFAULT_RAPID, o.W, o.H);
  const cells: TestCell[] = [];
  let clamped = false;
  prologue(w);
  o.powers.forEach((power, r) => o.speeds.forEach((speed, c) => {
    const x = TEST_MARGIN + c * (o.size + o.gap), y = TEST_MARGIN + r * (o.size + o.gap);
    const s = powerToS(power, o.sMax, o.capPct);
    const cl = power > o.capPct || power > 100;
    clamped = clamped || cl;
    cells.push({ speed, power, s, x, y, clamped: cl });
    const sq: [number, number][] = [[x, y], [x + o.size, y], [x + o.size, y + o.size], [x, y + o.size]];
    for (let p = 0; p < Math.max(1, Math.round(o.passes)); p++) w.cut(sq, Math.max(1, speed), s, p === 0);
  }));
  epilogue(w);
  const stats = w.stats(cells.length, clamped);
  const job: GcodeJob = {
    lines: w.lines, lineTimes: w.lineTimes, segments: w.segments, stats,
    header: ['Planche d\'essai : carrés par vitesse (colonnes) et puissance (lignes)', ...cells.map((c) => `X${num(c.x)} Y${num(c.y)} : F${c.speed} S${c.s} (${c.power} %)`)],
  };
  return { job, cells, fits: !stats.outOfBounds };
}

/** Valeurs régulièrement réparties entre `min` et `max` (arrondies). */
export function spread(min: number, max: number, count: number): number[] {
  if (count <= 1) return [Math.round(min)];
  return Array.from({ length: count }, (_, i) => Math.round(min + ((max - min) * i) / (count - 1)));
}

/** Texte du fichier .gcode (en-tête commenté + lignes). */
export function gcodeText(job: GcodeJob): string {
  return [...job.header.map((h) => `; ${h}`), ...job.lines].join('\n') + '\n';
}

/** Ligne de déplacement manuel : relatif, jamais de laser. */
export function jogLine(dx: number, dy: number, feed: number): string {
  return `$J=G91 G21 X${num(dx)} Y${num(dy)} F${num(feed)}`;
}

/** Durée « 1 h 02 min », « 4 min 12 s » ou « 35 s ». */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  if (h) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m) return `${m} min ${String(r).padStart(2, '0')} s`;
  return `${r} s`;
}
