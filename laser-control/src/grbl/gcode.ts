/**
 * Écriture du G-code (cadre à vide, planche d'essai, utilitaires) et types communs. Fonctions pures (sans React ni DOM).
 * La découpe d'un `LaserJob` est dans `../job/buildGcode.ts`.
 *
 * CONVENTION D'AXES : l'origine de travail (X0 Y0, système G54) est le coin BAS-GAUCHE de la planche vu de dessus,
 * X vers la droite, Y vers l'ARRIÈRE de la machine. Un SVG a l'origine en HAUT à gauche avec y vers le bas :
 * Ymachine = H − ySVG (fait à l'import, `job/svg.ts`). Le G-code est l'image du SVG « posé tel quel » sur le plateau, la façade de la machine vers le bas de l'écran.
 */

/** Zone de travail de la Sculpfun E1 Pro 21 W (mm). */
export const MACHINE_AREA = { W: 400, H: 320 } as const;

import { textStrokes } from './labels';
import { E1_MOTION, blockTimes, type MotionBlock, type MotionParams } from './motion';

export type PassMode = 'all' | 'contour';

export interface CutOptions {
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
  /** Accélération, coins et vitesse maximale de la machine (`$120` `$121` `$11` `$110` `$111`) pour une durée estimée juste ; ceux de la E1 Pro par défaut. */
  motion?: MotionParams;
  /** Assistance d'air : `M8` avant la coupe, `M9` après (pompe commandée par la carte de la E1 Pro). */
  air?: boolean;
  /** Gravure (couche `engrave` du travail) : vitesse (mm/min), puissance (%, soumise au même plafond) et passes. Une passe légère par défaut. */
  engraveFeed?: number;
  engravePowerPct?: number;
  engravePasses?: number;
}

export interface Segment { x0: number; y0: number; x1: number; y1: number; cut: boolean; /** Gravure (trait léger) plutôt que coupe. */ engrave?: boolean; /** Pièce dont ce contour fait partie (nom) : l'aperçu passe une pièce en pointillé quand elle est finie. */ piece?: string }

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
  /** Pour chaque segment de `segments`, l'indice de la ligne de `lines` qui le trace (pour suivre l'avancement de l'envoi sur l'aperçu). */
  segLines?: number[];
  stats: GcodeStats;
}

/** Vitesse des déplacements rapides (G0) : le maximum de la machine (`$110`, 36 000 mm/min), limitée dans le calcul de durée par l'accélération. */
export const DEFAULT_RAPID = E1_MOTION.maxRate;

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

/** Écrit les lignes de G-code en suivant la position, le temps, le tracé et les statistiques. */
export class Writer {
  lines: string[] = [];
  lineTimes: number[] = [];
  segments: Segment[] = [];
  /** Ligne qui trace chaque segment de `segments`. */
  segLines: number[] = [];
  x = 0; y = 0;
  t = 0;
  cutMm = 0; rapidMm = 0; maxS = 0;
  minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
  /** Déplacements, dans l'ordre, avec la ligne qui les écrit : la durée est calculée à la fin comme le fait le planificateur de GRBL (`motion.ts`). */
  private blocks: { line: number; b: MotionBlock }[] = [];
  /** Temps ajouté à la main par ligne (pauses, jog) en plus des déplacements. */
  private dts: number[] = [];
  private done = false;
  constructor(private rapidFeed: number, private W: number, private H: number, private motion: MotionParams = E1_MOTION) {}
  raw(line: string, dt = 0) { this.lines.push(line); this.dts.push(dt); this.t += dt; this.lineTimes.push(this.t); this.done = false; }
  private bound(x: number, y: number) { this.minX = Math.min(this.minX, x); this.minY = Math.min(this.minY, y); this.maxX = Math.max(this.maxX, x); this.maxY = Math.max(this.maxY, y); }
  private move(x: number, y: number, feed: number) { this.blocks.push({ line: this.lines.length - 1, b: { dx: x - this.x, dy: y - this.y, feed } }); }
  private segment(s: Segment) { this.segments.push(s); this.segLines.push(this.lines.length - 1); }
  /** Déplacement rapide (laser éteint : G0 en mode laser). Rien si on y est déjà. */
  rapid(x: number, y: number, record: boolean) {
    if (Math.abs(x - this.x) < 1e-6 && Math.abs(y - this.y) < 1e-6) return;
    const d = Math.hypot(x - this.x, y - this.y);
    this.raw(`G0 X${num(x)} Y${num(y)}`);
    this.move(x, y, this.rapidFeed);
    this.rapidMm += d;
    if (record) this.segment({ x0: this.x, y0: this.y, x1: x, y1: y, cut: false });
    this.x = x; this.y = y;
  }
  /** Coupe un contour fermé : part du premier point, revient au premier point. */
  cut(pts: [number, number][], feed: number, s: number, record: boolean, engrave = false, piece?: string) {
    this.rapid(pts[0][0], pts[0][1], record);
    this.bound(pts[0][0], pts[0][1]);
    const seq = [...pts.slice(1), pts[0]];
    seq.forEach(([x, y], i) => {
      const d = Math.hypot(x - this.x, y - this.y);
      this.raw(i === 0 ? `G1 X${num(x)} Y${num(y)} F${num(feed)} S${s}` : `G1 X${num(x)} Y${num(y)}`);
      this.move(x, y, feed);
      this.cutMm += d;
      this.maxS = Math.max(this.maxS, s);
      this.bound(x, y);
      if (record) this.segment({ x0: this.x, y0: this.y, x1: x, y1: y, cut: true, ...(engrave ? { engrave: true } : {}), ...(piece ? { piece } : {}) });
      this.x = x; this.y = y;
    });
  }
  /** Trait ouvert (gravure d'un texte) : va au premier point, suit la ligne, ne revient pas. */
  stroke(pts: [number, number][], feed: number, s: number, record: boolean) {
    this.rapid(pts[0][0], pts[0][1], record);
    this.bound(pts[0][0], pts[0][1]);
    pts.slice(1).forEach(([x, y], i) => {
      const d = Math.hypot(x - this.x, y - this.y);
      this.raw(i === 0 ? `G1 X${num(x)} Y${num(y)} F${num(feed)} S${s}` : `G1 X${num(x)} Y${num(y)}`);
      this.move(x, y, feed);
      this.cutMm += d;
      this.maxS = Math.max(this.maxS, s);
      this.bound(x, y);
      if (record) this.segment({ x0: this.x, y0: this.y, x1: x, y1: y, cut: true, engrave: true });
      this.x = x; this.y = y;
    });
  }
  /** Calcule les durées (accélération, coins) et refait `lineTimes` et `t`. Sans déplacement enregistré (cadre à vide), les durées données à `raw` sont gardées. */
  finalize() {
    if (this.done || !this.blocks.length) return;
    const times = blockTimes(this.blocks.map((q) => q.b), this.motion), byLine = new Map<number, number>();
    this.blocks.forEach((q, i) => byLine.set(q.line, (byLine.get(q.line) ?? 0) + times[i]));
    let t = 0;
    this.lineTimes = this.lines.map((_, i) => (t += this.dts[i] + (byLine.get(i) ?? 0)));
    this.t = t;
    this.done = true;
  }
  stats(contours: number, clamped: boolean): GcodeStats {
    this.finalize();
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
export function prologue(w: Writer, air = false) {
  w.raw('G21');
  w.raw('G90');
  w.raw('G54');
  w.raw('G94');
  w.raw('M5');
  if (air) w.raw('M8');
  w.raw('M4 S0');
}

/** Fin commune : laser éteint, retour à l'origine de travail, `M5` en dernière ligne. */
export function epilogue(w: Writer, air = false) {
  w.raw('M5');
  if (air) w.raw('M9');
  w.rapid(0, 0, true);
  w.raw('M5');
}

/** Rectangle à suivre pour le cadre. */
export interface FrameBox { minX: number; minY: number; maxX: number; maxY: number }

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
  /** Accélération, coins, vitesse maximale de la machine (durée estimée juste). */
  motion?: MotionParams;
  /** Assistance d'air (`M8` / `M9`). */
  air?: boolean;
  /** Écrit les valeurs à côté des carrés (puissance en % à gauche de chaque ligne, vitesse au-dessus de chaque colonne), gravées à ce régime AVANT la coupe : la grille se décale pour leur faire de la place. */
  labels?: { feed: number; powerPct: number };
}

export interface TestCell { speed: number; power: number; s: number; x: number; y: number; clamped: boolean }

export interface TestCardResult { job: GcodeJob; cells: TestCell[]; fits: boolean }

/** Marge entre le bord de la planche et la grille d'essai (mm). */
export const TEST_MARGIN = 5;

/** Hauteur des chiffres gravés (mm), place laissée à gauche pour la puissance (« 100% ») et au-dessus des carrés pour la vitesse. */
export const LABEL_HEIGHT = 4;
export const LABEL_LEFT = 14;
export const LABEL_TOP = 8;

/**
 * Planche d'essai : un petit carré découpé par couple (vitesse, puissance). Colonnes = vitesses, lignes = puissances (de bas en haut, en
 * partant de l'origine). Coordonnées (x, y) = coin bas-gauche de chaque carré, dans le repère de travail. Rien n'est gravé, sauf avec `labels` :
 * la puissance (« 80% ») est alors écrite à gauche de chaque ligne et la vitesse au-dessus de chaque colonne, pour lire la planche sans le tableau.
 */
export function buildTestCard(o: TestCardOptions): TestCardResult {
  const w = new Writer(o.rapidFeed ?? DEFAULT_RAPID, o.W, o.H, o.motion);
  const cells: TestCell[] = [];
  let clamped = false;
  prologue(w, o.air);
  const left = o.labels ? LABEL_LEFT : 0, pitch = o.size + o.gap;
  if (o.labels) { // les valeurs d'abord, à bas régime : la coupe des carrés vient ensuite
    const sl = powerToS(o.labels.powerPct, o.sMax, o.capPct), feed = Math.max(1, o.labels.feed);
    const write = (text: string, x: number, y: number) => { for (const st of textStrokes(text, x, y, LABEL_HEIGHT)) w.stroke(st, feed, sl, true); };
    o.powers.forEach((power, r) => write(`${power}%`, TEST_MARGIN, TEST_MARGIN + r * pitch + (o.size - LABEL_HEIGHT) / 2));
    o.speeds.forEach((speed, c) => write(`${speed}`, TEST_MARGIN + left + c * pitch, TEST_MARGIN + o.powers.length * pitch - o.gap + 2));
  }
  o.powers.forEach((power, r) => o.speeds.forEach((speed, c) => {
    const x = TEST_MARGIN + left + c * pitch, y = TEST_MARGIN + r * pitch;
    const s = powerToS(power, o.sMax, o.capPct);
    const cl = power > o.capPct || power > 100;
    clamped = clamped || cl;
    cells.push({ speed, power, s, x, y, clamped: cl });
    const sq: [number, number][] = [[x, y], [x + o.size, y], [x + o.size, y + o.size], [x, y + o.size]];
    for (let p = 0; p < Math.max(1, Math.round(o.passes)); p++) w.cut(sq, Math.max(1, speed), s, p === 0);
  }));
  epilogue(w, o.air);
  const stats = w.stats(cells.length, clamped);
  const job: GcodeJob = {
    lines: w.lines, lineTimes: w.lineTimes, segments: w.segments, segLines: w.segLines, stats,
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
