import { describe, expect, it } from 'vitest';
import { EXAMPLE_SVG, buildGcode, flattenPath, itemFromFile, parseGcode, parseSvg, parseTransform } from '../src';

const OPT = { feed: 300, powerPct: 60, passes: 1, passMode: 'all' as const, sMax: 1000, capPct: 80 };

describe('import SVG', () => {
  it('lit la planche, retourne Y (origine en bas à gauche) et classe noir = coupe, bleu = gravure, gris ignoré', () => {
    const { job, warnings } = parseSvg(EXAMPLE_SVG);
    expect(job.widthMm).toBe(120);
    expect(job.heightMm).toBe(120);
    expect(job.layers.cut).toHaveLength(3); // carré, cercle, petit carré (le cadre gris est ignoré)
    expect(job.layers.engrave).toHaveLength(1);
    expect(warnings).toEqual([]);
    // le grand carré (10,10)-(110,110) : symétrique en Y ; le petit carré (20,20)-(32,32) est en haut du SVG donc à y = 88…100
    const small = job.layers.cut.find((p) => p.length === 4 && Math.max(...p.map((q) => q[0])) < 40)!;
    expect(Math.min(...small.map((q) => q[1]))).toBeCloseTo(88, 5);
    expect(Math.max(...small.map((q) => q[1]))).toBeCloseTo(100, 5);
    const eng = job.layers.engrave![0];
    expect(Math.min(...eng.map((q) => q[1]))).toBeCloseTo(20, 5); // (80..100, 80..100) du SVG → y = 20…40
  });

  it('un SVG exporté par l\'application du nichoir (polygone noir, texte bleu, cadre gris) donne la pièce et ses trous', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="410mm" height="400mm" viewBox="0 0 410 400"><rect x="0.05" y="0.05" width="409.9" height="399.9" fill="none" stroke="#bbb" stroke-width="0.1" stroke-dasharray="2 2"/><text x="400" y="397" font-size="4" text-anchor="end" fill="#999">planche 1</text><polygon points="8,8 58,8 58,48 8,48" fill="none" stroke="#000" stroke-width="0.1"/><polygon points="20,20 30,20 30,30 20,30" fill="none" stroke="#000" stroke-width="0.1"/><text x="12" y="14" font-size="4" fill="#00f" font-family="sans-serif">Face avant</text></svg>`;
    const { job } = parseSvg(svg);
    expect(job.widthMm).toBe(410);
    expect(job.heightMm).toBe(400);
    expect(job.layers.cut).toHaveLength(2);
    expect(job.layers.engrave).toBeUndefined();
    const g = buildGcode(job, OPT);
    expect(g.stats.contours).toBe(2);
    // le trou est coupé avant l'extérieur
    const firstG1 = g.lines.findIndex((l) => l.startsWith('G1'));
    expect(g.lines[firstG1 - 1]).toBe('G0 X20 Y380');
    expect(g.stats.outOfBounds).toBe(false);
  });

  it('applique viewBox décalé, échelle de width en mm, transform de groupe, chemins relatifs et arcs', () => {
    const svg = `<svg width="100mm" height="50mm" viewBox="0 0 200 100"><g transform="translate(10 0) scale(2)"><path d="m 0 0 h 10 v 10 h -10 z" stroke="black" fill="none"/></g><path d="M 50 50 a 10 10 0 1 1 0.01 0 z" stroke="#111" fill="none"/></svg>`;
    const { job } = parseSvg(svg);
    expect(job.widthMm).toBe(100);
    expect(job.heightMm).toBe(50);
    const sq = job.layers.cut[0];
    // (10,0)-(30,20) en unités du viewBox, ×0,5 en mm, Y retourné sur 50 mm
    expect(Math.min(...sq.map((p) => p[0]))).toBeCloseTo(5, 5);
    expect(Math.max(...sq.map((p) => p[0]))).toBeCloseTo(15, 5);
    expect(Math.max(...sq.map((p) => p[1]))).toBeCloseTo(50, 5);
    expect(Math.min(...sq.map((p) => p[1]))).toBeCloseTo(40, 5);
    expect(job.layers.cut.length).toBe(2); // le cercle fait par arc
    expect(job.layers.cut[1].length).toBeGreaterThan(20);
  });

  it('signale les traits ouverts, les couleurs inconnues, et refuse ce qui n\'est pas un SVG', () => {
    const svg = `<svg viewBox="0 0 100 100"><polyline points="0,0 10,10 20,0" stroke="#000" fill="none"/><rect width="10" height="10" stroke="#f00" fill="none"/></svg>`;
    const { job, warnings } = parseSvg(svg);
    expect(job.layers.cut).toHaveLength(0);
    expect(warnings.join(' ')).toMatch(/ouvert/);
    expect(warnings.join(' ')).toMatch(/autre couleur/);
    expect(() => parseSvg('bonjour')).toThrow();
    expect(() => parseSvg('<svg></svg>')).toThrow(/taille/);
    expect(() => itemFromFile('vide.svg', '<svg viewBox="0 0 10 10"></svg>')).toThrow();
  });

  it('flattenPath et parseTransform', () => {
    const subs = flattenPath('M0 0 L10 0 L10 10 Z M20 20 L30 20');
    expect(subs.map((s) => s.closed)).toEqual([true, false]);
    expect(parseTransform('translate(5 6)')).toEqual([1, 0, 0, 1, 5, 6]);
    const r = parseTransform('rotate(90)');
    expect(r[0]).toBeCloseTo(0);
    expect(r[1]).toBeCloseTo(1);
  });
});

describe('import de fichiers', () => {
  it('reconnaît SVG et G-code, et refuse le reste', () => {
    const svg = itemFromFile('boite.svg', EXAMPLE_SVG);
    expect(svg.job?.widthMm).toBe(120);
    expect(svg.fileName).toBe('boite');
    const gc = itemFromFile('essai.nc', 'G21\nG90\nG1 X10 F300 S100\nM5\n');
    expect(gc.gcode).toBeDefined();
    expect(() => itemFromFile('lisez-moi.md', '# bonjour')).toThrow(/Format/);
    expect(() => itemFromFile('vide.gcode', 'rien du tout')).toThrow(/G-code/);
  });
});

describe('import G-code', () => {
  const OPT_G = { sMax: 1000, capPct: 80 };

  it('trace le parcours, retire les commandes $, plafonne S et ajoute M5', () => {
    const text = '; test\n$32=0\nG21 G90\nM4 S0\nG0 X10 Y10\nG1 X30 Y10 F600 S1000\nG1 X30 Y30\nG91\nG1 X-20 Y0\nG90\nG0 X0 Y0\n';
    const { job, warnings } = parseGcode(text, OPT_G);
    expect(job.lines.some((l) => l.startsWith('$'))).toBe(false);
    expect(job.lines.join('\n')).toContain('S800');
    expect(job.lines.join('\n')).not.toContain('S1000');
    expect(job.lines[job.lines.length - 1]).toBe('M5');
    expect(job.stats.maxS).toBe(800);
    expect(job.stats.clamped).toBe(true);
    expect(job.stats.cutMm).toBeCloseTo(60, 5);
    expect(job.stats.bounds).toEqual({ minX: 10, minY: 10, maxX: 30, maxY: 30 });
    expect(job.stats.outOfBounds).toBe(false);
    expect(job.stats.seconds).toBeGreaterThan(5);
    expect(job.segments.filter((s) => s.cut)).toHaveLength(3);
    expect(warnings.join(' ')).toMatch(/retirée/);
    expect(warnings.join(' ')).toMatch(/plafond/);
    expect(warnings.join(' ')).toMatch(/M5/);
    expect(job.lineTimes).toHaveLength(job.lines.length);
  });

  it('suit les arcs G2 / G3 et signale un tracé hors de la machine', () => {
    const { job } = parseGcode('G21 G90\nM4 S0\nG0 X0 Y0\nG3 X20 Y0 I10 J0 F500 S300\nM5\n', OPT_G);
    expect(job.stats.cutMm).toBeCloseTo(Math.PI * 10, 0);
    const big = parseGcode('G90\nM4 S0\nG1 X700 Y0 F500 S100\nM5\n', OPT_G);
    expect(big.job.stats.outOfBounds).toBe(true);
  });
});
