import { DEFAULT_RAPID, MACHINE_AREA, cleanLine, powerToS, type GcodeJob, type Segment } from '../grbl/gcode';

export interface GcodeImportOptions {
  /** Valeur `$30` de la machine (S max). */
  sMax: number;
  /** Plafond de puissance (%). */
  capPct: number;
  /** Zone à ne pas dépasser (mm) ; la zone de la machine par défaut. */
  W?: number;
  H?: number;
  rapidFeed?: number;
}

export interface GcodeImport { job: GcodeJob; warnings: string[] }

const num = (v: number): string => (Math.round(v * 1000) / 1000).toString().replace(/^-0$/, '0');

/**
 * Lit un programme G-code déjà prêt (`.gcode`, `.nc`) pour l'envoyer à la machine et en tracer l'aperçu.
 * Les lignes sont envoyées telles quelles, avec trois protections : les commandes `$…` (réglages de la machine) sont retirées, toute valeur S au-dessus
 * du plafond de puissance est ramenée au plafond, et `M5` est ajouté à la fin si le programme ne s'éteint pas lui-même.
 * L'aperçu suit G0 / G1 / G2 / G3 (absolu ou relatif, mm ou pouces) ; la durée est une estimation.
 */
export function parseGcode(text: string, opt: GcodeImportOptions): GcodeImport {
  const warnings: string[] = [];
  const W = opt.W ?? MACHINE_AREA.W, H = opt.H ?? MACHINE_AREA.H;
  const rapid = opt.rapidFeed ?? DEFAULT_RAPID;
  const capS = powerToS(100, opt.sMax, opt.capPct);
  const lines: string[] = [], lineTimes: number[] = [], segments: Segment[] = [];
  let x = 0, y = 0, t = 0, feed = 0, s = 0, spindle = false, rel = false, inch = false, motion = 0;
  let cutMm = 0, rapidMm = 0, maxS = 0, contours = 0, wasCutting = false, clamped = false, dropped = 0, long = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const bound = (px: number, py: number) => { minX = Math.min(minX, px); minY = Math.min(minY, py); maxX = Math.max(maxX, px); maxY = Math.max(maxY, py); };

  const move = (nx: number, ny: number, cutting: boolean) => {
    const d = Math.hypot(nx - x, ny - y);
    if (d > 0) {
      const f = motion === 0 ? rapid : Math.max(1, feed || 1);
      t += (d / f) * 60;
      if (cutting) { cutMm += d; bound(x, y); bound(nx, ny); } else rapidMm += d;
      segments.push({ x0: x, y0: y, x1: nx, y1: ny, cut: cutting });
    }
    x = nx; y = ny;
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = cleanLine(raw).toUpperCase();
    if (!line) continue;
    if (line.startsWith('$')) { dropped++; continue; } // réglages de la machine : jamais depuis un fichier
    if (line.length > 80) long++;
    const words = [...line.matchAll(/([A-Z])\s*(-?\d*\.?\d+)/g)].map((m) => ({ c: m[1], v: Number(m[2]) }));
    let out = line;
    // plafond de puissance : toute valeur S au-dessus est réécrite
    out = out.replace(/S\s*(-?\d*\.?\d+)/g, (_m, v: string) => { if (Number(v) > capS) { clamped = true; return `S${capS}`; } return `S${v}`; });
    const w = (c: string) => words.find((q) => q.c === c)?.v;
    for (const { c, v } of words) {
      if (c === 'G') {
        if (v === 0 || v === 1 || v === 2 || v === 3) motion = v;
        else if (v === 90) rel = false;
        else if (v === 91) rel = true;
        else if (v === 20) inch = true;
        else if (v === 21) inch = false;
      } else if (c === 'M') {
        if (v === 3 || v === 4) spindle = true;
        else if (v === 5 || v === 2 || v === 30) spindle = false;
      }
    }
    if (w('F') !== undefined) feed = (w('F') as number) * (inch ? 25.4 : 1);
    if (w('S') !== undefined) s = Math.min(w('S') as number, capS);
    const gs = words.filter((q) => q.c === 'G').map((q) => q.v);
    const hasMove = w('X') !== undefined || w('Y') !== undefined;
    const g4 = gs.includes(4);
    const k = inch ? 25.4 : 1;
    if (g4) t += w('P') ?? 0;
    if (hasMove && !gs.includes(10) && !gs.includes(92) && !gs.includes(53)) {
      const nx = w('X') !== undefined ? (rel ? x : 0) + (w('X') as number) * k : x;
      const ny = w('Y') !== undefined ? (rel ? y : 0) + (w('Y') as number) * k : y;
      const cutting = motion !== 0 && spindle && s > 0;
      if (cutting && !wasCutting) contours++;
      if (motion === 2 || motion === 3) {
        const i = (w('I') ?? 0) * k, j = (w('J') ?? 0) * k;
        const cx = x + i, cy = y + j, r = Math.hypot(x - cx, y - cy);
        let a0 = Math.atan2(y - cy, x - cx), a1 = Math.atan2(ny - cy, nx - cx);
        if (motion === 2) { if (a1 >= a0) a1 -= 2 * Math.PI; } else if (a1 <= a0) a1 += 2 * Math.PI;
        if (Math.abs(a1 - a0) < 1e-9) a1 = a0 + (motion === 2 ? -1 : 1) * 2 * Math.PI;
        const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 24)));
        for (let q = 1; q <= n; q++) {
          const a = a0 + ((a1 - a0) * q) / n;
          move(q === n ? nx : cx + r * Math.cos(a), q === n ? ny : cy + r * Math.sin(a), cutting);
        }
      } else move(nx, ny, cutting);
      wasCutting = cutting;
      if (cutting) maxS = Math.max(maxS, s);
    } else if (!hasMove) wasCutting = wasCutting && spindle;
    lines.push(out);
    lineTimes.push(t);
  }
  if (!lines.length) warnings.push('Le fichier ne contient aucune commande.');
  const last = lines[lines.length - 1];
  if (lines.length && last !== 'M5' && !/^M(2|30)$/.test(last)) {
    lines.push('M5'); lineTimes.push(t);
    warnings.push('« M5 » ajouté à la fin : le programme n\'éteignait pas le laser.');
  }
  if (dropped) warnings.push(`${dropped} commande${dropped > 1 ? 's' : ''} « $… » retirée${dropped > 1 ? 's' : ''} (les réglages de la machine ne sont pas modifiés par un fichier).`);
  if (clamped) warnings.push(`Valeurs S limitées au plafond de puissance (S${capS}).`);
  if (long) warnings.push(`${long} ligne${long > 1 ? 's' : ''} de plus de 80 caractères : GRBL les refusera (error:11).`);
  if (!segments.some((q) => q.cut)) warnings.push('Aucun trait de coupe trouvé (G1 avec laser allumé).');
  const has = Number.isFinite(minX);
  const eps = 1e-6;
  const stats = {
    contours, lines: lines.length, cutMm, rapidMm, seconds: t,
    bounds: has ? { minX, minY, maxX, maxY } : null,
    outOfBounds: has && (minX < -eps || minY < -eps || maxX > W + eps || maxY > H + eps),
    maxS, clamped,
  };
  return { job: { lines, lineTimes, segments, stats, header: [`G-code importé : ${lines.length} lignes, X0 Y0 = origine de travail, F${num(feed)} dernier`] }, warnings };
}
