import { describe, expect, it } from 'vitest';
import { buildFrame, buildGcode, buildTestCard, cleanLine, formatDuration, jogLine, powerToS, spread, type CutOptions, type LaserJob } from '../src';

const OPT: CutOptions = { feed: 300, powerPct: 60, passes: 2, passMode: 'all', sMax: 1000, capPct: 80 };

/** Deux pièces : une grande plaque 100 × 80 avec un trou rond, et une petite 10 × 10 rangée à côté. */
function job(): LaserJob {
  const circle = Array.from({ length: 16 }, (_, k): [number, number] => [60 + 10 * Math.cos((k * Math.PI) / 8), 40 + 10 * Math.sin((k * Math.PI) / 8)]);
  return {
    widthMm: 200, heightMm: 100,
    layers: { cut: [] },
    pieces: [
      { name: 'grande', contours: [[[5, 5], [105, 5], [105, 85], [5, 85]], circle] },
      { name: 'petite', contours: [[[120, 10], [130, 10], [130, 20], [120, 20]]] },
    ],
  };
}

/** Lignes G1 / G0 avec leur position précédente. */
function trace(lines: string[]) {
  const out: { g: number; x: number; y: number; line: number }[] = [];
  let x = 0, y = 0;
  lines.forEach((l, i) => {
    const m = /^G([01]) X(-?[\d.]+) Y(-?[\d.]+)/.exec(l);
    if (!m) return;
    x = Number(m[2]); y = Number(m[3]);
    out.push({ g: Number(m[1]), x, y, line: i });
  });
  return out;
}

describe('buildGcode', () => {
  it('commence par un prologue sûr (mm, absolu, M5 puis M4 S0) et finit par M5', () => {
    const g = buildGcode(job(), OPT);
    expect(g.lines.slice(0, 6)).toEqual(['G21', 'G90', 'G54', 'G94', 'M5', 'M4 S0']);
    expect(g.lines[g.lines.length - 1]).toBe('M5');
    expect(g.lines[g.lines.length - 2]).toBe('G0 X0 Y0');
  });

  it('assistance d air : M8 après M5 et avant M4 S0, M9 avant le retour à l origine, M5 toujours en dernier ; éteinte par défaut (G-code inchangé)', () => {
    const off = buildGcode(job(), OPT), on = buildGcode(job(), { ...OPT, air: true });
    expect(off.lines).not.toContain('M8'); expect(off.lines).not.toContain('M9');
    expect(on.lines.slice(0, 7)).toEqual(['G21', 'G90', 'G54', 'G94', 'M5', 'M8', 'M4 S0']);
    expect(on.lines.slice(-4)).toEqual(['M5', 'M9', 'G0 X0 Y0', 'M5']);
    expect(on.lines.filter((l) => l !== 'M8' && l !== 'M9')).toEqual(off.lines); // rien d'autre ne change
    expect(on.header.join(' ')).toContain('M8');
  });

  it('coupe la petite pièce avant la grande, et le trou avant le contour extérieur', () => {
    const g = buildGcode(job(), { ...OPT, passes: 1 });
    const cutStarts = g.lines.map((l, i) => ({ l, i })).filter(({ l }) => l.startsWith('G1') && l.includes('F'));
    expect(cutStarts).toHaveLength(3); // petite, trou, grande
    const pts = trace(g.lines);
    const at = (i: number) => pts.find((p) => p.line === i)!;
    expect(at(cutStarts[0].i).x).toBeGreaterThan(115); // la petite pièce (x ≥ 120) d'abord
    expect(at(cutStarts[1].i).x).toBeLessThan(75); // puis le trou rond (x ∈ 50…70)
    expect(at(cutStarts[1].i).x).toBeGreaterThan(48);
    expect(at(cutStarts[2].i).x).toBeLessThan(110); // puis le contour de la grande plaque
    expect(g.stats.contours).toBe(3);
  });

  it("n'écrit jamais de S au-dessus du plafond ni de S max", () => {
    const g = buildGcode(job(), { ...OPT, powerPct: 100, capPct: 50 });
    const ss = g.lines.flatMap((l) => [...l.matchAll(/S(\d+)/g)].map((m) => Number(m[1])));
    expect(Math.max(...ss)).toBe(500);
    expect(g.stats.maxS).toBe(500);
    expect(g.stats.clamped).toBe(true);
    const g2 = buildGcode(job(), { ...OPT, powerPct: 100, capPct: 100, sMax: 255 });
    expect(g2.stats.maxS).toBe(255);
  });

  it('repète les passes : tout le jeu ou contour par contour', () => {
    const all = buildGcode(job(), { ...OPT, passes: 3, passMode: 'all' });
    const one = buildGcode(job(), { ...OPT, passes: 3, passMode: 'contour' });
    const count = (g: { lines: string[] }) => g.lines.filter((l) => l.startsWith('G1') && l.includes('F')).length;
    expect(count(all)).toBe(9);
    expect(count(one)).toBe(9);
    const starts = (g: { lines: string[] }) => g.lines.filter((l) => l.startsWith('G1') && l.includes('F')).slice(0, 3);
    expect(new Set(starts(one)).size).toBe(1); // le même contour trois fois de suite
    expect(new Set(starts(all)).size).toBe(3); // sinon un contour différent à chaque fois
  });

  it('ordonne sans `pieces` par imbrication : trou dans une pièce, pièce dans le trou d\'une autre', () => {
    const j: LaserJob = {
      widthMm: 300, heightMm: 300,
      layers: { cut: [
        [[0, 0], [200, 0], [200, 200], [0, 200]], // A (extérieur)
        [[50, 50], [150, 50], [150, 150], [50, 150]], // trou de A
        [[80, 80], [120, 80], [120, 120], [80, 120]], // pièce B posée dans le trou de A
        [[90, 90], [100, 90], [100, 100], [90, 100]], // trou de B
      ] },
    };
    const g = buildGcode(j, { ...OPT, passes: 1 });
    const starts = trace(g.lines).filter((p) => p.g === 0).map((p) => `${p.x},${p.y}`);
    expect(starts.slice(0, 4)).toEqual(['90,90', '80,80', '50,50', '0,0']); // trou de B, B, trou de A, A
  });

  it('grave avant de couper, à sa propre vitesse et puissance, sous le même plafond', () => {
    const j: LaserJob = { ...job(), layers: { cut: [], engrave: [[[20, 20], [40, 20], [40, 30], [20, 30]]] } };
    const g = buildGcode(j, { ...OPT, passes: 1, engraveFeed: 1500, engravePowerPct: 90, capPct: 40 });
    const firstCut = g.lines.find((l) => l.startsWith('G1') && l.includes('F'))!;
    expect(firstCut).toMatch(/F1500 S400$/); // 90 % limité à 40 % de 1000
    expect(g.segments.find((s) => s.cut)!.engrave).toBe(true);
    expect(g.stats.clamped).toBe(true);
  });

  it('estime la durée et signale un tracé hors de la planche', () => {
    const g = buildGcode(job(), OPT);
    expect(g.stats.seconds).toBeGreaterThan(0);
    expect(g.stats.outOfBounds).toBe(false);
    const big = buildGcode({ ...job(), widthMm: 100 }, OPT);
    expect(big.stats.outOfBounds).toBe(true);
    expect(g.lineTimes).toHaveLength(g.lines.length);
  });
});

describe('cadre à vide et planche d\'essai', () => {
  it('le cadre ne contient jamais de S ni de G1 : seulement M5 et des déplacements $J=', () => {
    const f = buildFrame({ minX: 10, minY: 10, maxX: 60, maxY: 40 }, 3000);
    expect(f.lines[0]).toBe('M5');
    for (const l of f.lines.slice(1)) expect(l).toMatch(/^\$J=G90 G21 X-?[\d.]+ Y-?[\d.]+ F3000$/);
    expect(f.lines.join('\n')).not.toMatch(/S\d|M[34]|G1\b/);
  });

  it('la planche d\'essai découpe un carré par couple, plafonne S et finit par M5', () => {
    const t = buildTestCard({ W: 410, H: 400, speeds: spread(150, 450, 4), powers: spread(40, 100, 4), size: 10, gap: 5, passes: 1, sMax: 1000, capPct: 80 });
    expect(t.cells).toHaveLength(16);
    expect(t.fits).toBe(true);
    expect(t.cells.filter((c) => c.clamped).length).toBeGreaterThan(0);
    expect(t.job.stats.maxS).toBe(800);
    expect(t.job.lines[t.job.lines.length - 1]).toBe('M5');
    expect(t.cells[0]).toMatchObject({ speed: 150, power: 40, x: 5, y: 5 });
  });
});

describe('utilitaires', () => {
  it('powerToS, cleanLine, jogLine, spread, formatDuration', () => {
    expect(powerToS(50, 1000, 80)).toBe(500);
    expect(powerToS(100, 1000, 80)).toBe(800);
    expect(powerToS(-5, 1000, 80)).toBe(0);
    expect(cleanLine('G1 X1 (note) ; fin')).toBe('G1 X1');
    expect(jogLine(1.5, -2, 3000)).toBe('$J=G91 G21 X1.5 Y-2 F3000');
    expect(spread(100, 300, 3)).toEqual([100, 200, 300]);
    expect(formatDuration(3725)).toBe('1 h 02 min');
    expect(formatDuration(35)).toBe('35 s');
  });
});
