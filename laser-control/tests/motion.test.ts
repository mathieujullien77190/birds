import { describe, expect, it } from 'vitest';
import { E1_MOTION, blockTimes, buildGcode, motionFrom, parseGcode, type LaserJob } from '../src';

const A = E1_MOTION.accel;

describe('blockTimes : durée comme le planificateur de GRBL', () => {
  it('un trait droit long : accélération, palier, freinage', () => {
    const [t] = blockTimes([{ dx: 100, dy: 0, feed: 6000 }]); // 100 mm/s, 5 mm pour accélérer, 5 mm pour freiner
    expect(t).toBeCloseTo(2 * (100 / A) + 90 / 100, 9);
  });
  it('un trait court n\'atteint jamais la vitesse demandée (triangle)', () => {
    const [t] = blockTimes([{ dx: 4, dy: 0, feed: 6000 }]);
    expect(t).toBeCloseTo(2 * (Math.sqrt(A * 4) / A), 9);
    expect(t).toBeGreaterThan(4 / 100); // bien plus long que longueur / vitesse
  });
  it('deux traits alignés se suivent sans ralentir : comme un seul trait', () => {
    const two = blockTimes([{ dx: 50, dy: 0, feed: 6000 }, { dx: 50, dy: 0, feed: 6000 }]);
    expect(two[0] + two[1]).toBeCloseTo(blockTimes([{ dx: 100, dy: 0, feed: 6000 }])[0], 9);
  });
  it('un coin à 90° limite la vitesse selon la tolérance (formule de GRBL), un demi-tour s\'arrête, un coin plat non', () => {
    const vj = Math.sqrt((A * E1_MOTION.junctionDev * Math.SQRT1_2) / (1 - Math.SQRT1_2));
    const [a, b] = blockTimes([{ dx: 100, dy: 0, feed: 6000 }, { dx: 0, dy: 100, feed: 6000 }]);
    const leg = (v0: number, v1: number) => (100 - (100 * 100 - v0 * v0) / (2 * A) - (100 * 100 - v1 * v1) / (2 * A)) / 100 + (100 - v0) / A + (100 - v1) / A; // palier à 100 mm/s entre deux vitesses d'extrémité
    expect(a).toBeCloseTo(leg(0, vj), 6);
    expect(b).toBeCloseTo(leg(vj, 0), 6);
    const straight = blockTimes([{ dx: 100, dy: 0, feed: 6000 }])[0];
    expect(a + b).toBeLessThan(2 * straight); // le coin se passe à ~5 mm/s au lieu d'un arrêt complet
    expect(a + b).toBeGreaterThan(blockTimes([{ dx: 200, dy: 0, feed: 6000 }])[0]); // mais plus long que le même chemin tout droit
    const back = blockTimes([{ dx: 100, dy: 0, feed: 6000 }, { dx: -100, dy: 0, feed: 6000 }]);
    expect(back[0] + back[1]).toBeCloseTo(2 * straight, 9); // demi-tour : arrêt complet entre les deux
  });
  it('la vitesse maximale et l\'accélération se comptent par axe : en diagonale elles montent d\'un facteur √2', () => {
    const [diag] = blockTimes([{ dx: 1000, dy: 1000, feed: 1e9 }]);
    const vmax = (E1_MOTION.maxRate / Math.SQRT1_2) / 60, aD = A / Math.SQRT1_2, d = Math.hypot(1000, 1000);
    expect(diag).toBeCloseTo(2 * (vmax / aD) + (d - vmax * vmax / aD) / vmax, 6);
    const [slow] = blockTimes([{ dx: 10, dy: 0, feed: 0 }]); // avance nulle : 1 mm/min
    expect(slow).toBeGreaterThan(500);
  });
  it('un déplacement nul dure 0 et ne casse pas les coins voisins ; une liste vide donne une liste vide', () => {
    expect(blockTimes([])).toEqual([]);
    const t = blockTimes([{ dx: 100, dy: 0, feed: 6000 }, { dx: 0, dy: 0, feed: 6000 }, { dx: 100, dy: 0, feed: 6000 }]);
    expect(t[1]).toBe(0);
    expect(t[0] + t[2]).toBeCloseTo(blockTimes([{ dx: 200, dy: 0, feed: 6000 }])[0], 9);
  });
  it('des paramètres de machine plus mous (moins d\'accélération) allongent la durée', () => {
    const fast = blockTimes([{ dx: 20, dy: 0, feed: 6000 }])[0], soft = blockTimes([{ dx: 20, dy: 0, feed: 6000 }], { ...E1_MOTION, accel: 250 })[0];
    expect(soft).toBeGreaterThan(fast);
  });
});

describe('motionFrom : paramètres lus des réglages de la machine', () => {
  it('le plus faible des deux axes, ceux de la E1 Pro pour tout réglage absent ou invalide', () => {
    expect(motionFrom({})).toEqual(E1_MOTION);
    expect(motionFrom({ 120: 800, 121: 600, 11: 0.02, 110: 30000, 111: 24000 })).toEqual({ accel: 600, junctionDev: 0.02, maxRate: 24000 });
    expect(motionFrom({ 120: 800, 110: 30000 })).toEqual({ accel: 800, junctionDev: E1_MOTION.junctionDev, maxRate: 30000 }); // un seul axe connu
    expect(motionFrom({ 121: 700, 111: 20000 })).toEqual({ accel: 700, junctionDev: E1_MOTION.junctionDev, maxRate: 20000 });
    expect(motionFrom({ 120: -5, 121: NaN, 11: 0, 110: 0 })).toEqual(E1_MOTION);
  });
});

describe('durée des programmes et suivi des lignes', () => {
  const box = (x: number, y: number, w: number, h: number): [number, number][] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const job: LaserJob = { widthMm: 100, heightMm: 100, layers: { cut: [box(10, 10, 10, 10), box(40, 10, 10, 10)] } };
  const opt = { feed: 600, powerPct: 100, passes: 1, passMode: 'all' as const, sMax: 1000, capPct: 100 };
  it('la durée dépasse « longueur / vitesse » (accélérations, coins) ; les temps par ligne croissent jusqu\'à la durée totale', () => {
    const g = buildGcode(job, opt);
    expect(g.stats.seconds).toBeGreaterThan((g.stats.cutMm / 600) * 60);
    for (let i = 1; i < g.lineTimes.length; i++) expect(g.lineTimes[i]).toBeGreaterThanOrEqual(g.lineTimes[i - 1]);
    expect(g.lineTimes[g.lineTimes.length - 1]).toBeCloseTo(g.stats.seconds, 9);
    expect(g.lineTimes).toHaveLength(g.lines.length);
  });
  it('un G-code dont les coins sont lents prend plus de temps qu\'une machine à coins permissifs', () => {
    const text = 'M4 S500\nG1 X10 F6000\nG1 Y10\nG1 X0\nG1 Y0\nM5';
    const strict = parseGcode(text, { sMax: 1000, capPct: 100, motion: { ...E1_MOTION, junctionDev: 0.001 } }).job.stats.seconds;
    const loose = parseGcode(text, { sMax: 1000, capPct: 100, motion: { ...E1_MOTION, junctionDev: 1 } }).job.stats.seconds;
    expect(strict).toBeGreaterThan(loose);
  });
  it('chaque segment de l\'aperçu garde la ligne qui le trace', () => {
    const g = buildGcode(job, opt);
    expect(g.segLines).toHaveLength(g.segments.length);
    expect(g.segLines!.every((l, i) => l >= 0 && l < g.lines.length && (i === 0 || l > g.segLines![i - 1]))).toBe(true);
    const seg = g.segments[1], line = g.lines[g.segLines![1]]; // le segment est celui de sa ligne G0 / G1
    expect(line).toContain(`X${seg.x1}`);
    const imp = parseGcode('G0 X10 Y10\nM4 S500\nG1 X20 Y10 F600\nM5', { sMax: 1000, capPct: 100 });
    expect(imp.job.segLines).toEqual([0, 2]);
  });
});

import { LOOKAHEAD, currentSegment } from '../src/components/GcodePreview/helpers';

describe('currentSegment : où en est le tracé', () => {
  // quatre segments à la suite le long de X : [0,10] [10,20] [20,30] [30,40], tracés par les lignes 2, 3, 4, 5
  const segs = [0, 10, 20, 30].map((x) => ({ x0: x, y0: 0, x1: x + 10, y1: 0, cut: true }));
  const lines = [2, 3, 4, 5];
  it("rien d'accepté ou pas de position de la tête : on reste où l'on est", () => {
    expect(currentSegment(segs, lines, 0, { x: 5, y: 0 })).toBe(0);
    expect(currentSegment(segs, lines, 99, undefined)).toBe(0);
    expect(currentSegment(segs, lines, 99, undefined, 2)).toBe(2);
  });
  it('avec la tête : le segment le plus proche, jamais en arrière ; seulement parmi ceux déjà envoyés', () => {
    expect(currentSegment(segs, lines, 99, { x: 12, y: 0 })).toBe(1); // tout est envoyé mais la tête est au 2ᵉ segment
    expect(currentSegment(segs, lines, 99, { x: 35, y: 1 })).toBe(3);
    expect(currentSegment(segs, lines, 99, { x: 10, y: 0 })).toBe(0); // exactement entre deux segments : le premier, encore en cours
    expect(currentSegment(segs, lines, 99, { x: 12, y: 0 }, 2)).toBe(2); // on part du dernier segment connu : pas de retour en arrière
    expect(currentSegment(segs, lines, 4, { x: 35, y: 0 })).toBe(1); // les segments non envoyés (lignes 4 et 5) ne comptent pas
    expect(currentSegment(segs, lines, 3, { x: 35, y: 0 }, 3)).toBe(0); // plus aucun segment à regarder au-delà de ceux envoyés
    expect(currentSegment([{ x0: 5, y0: 5, x1: 5, y1: 5, cut: true }], [0], 99, { x: 7, y: 5 })).toBe(0); // segment de longueur nul
  });
  it("sur un long tracé, la tête est cherchée parmi les segments qui suivent le dernier connu, pas plus loin (la machine a de l'avance dans sa mémoire tampon)", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ x0: i, y0: 0, x1: i + 1, y1: 0, cut: true })), ln = many.map((_, i) => i);
    expect(currentSegment(many, ln, 200, { x: 30.5, y: 0 })).toBe(30); // dans la fenêtre de recherche
    expect(LOOKAHEAD).toBeGreaterThan(200); // une position rafraîchie lentement (beaucoup de petits segments parcourus) ne fait pas décrocher
    const far = Array.from({ length: LOOKAHEAD + 100 }, (_, i) => ({ x0: i, y0: 0, x1: i + 1, y1: 0, cut: true }));
    expect(currentSegment(far, far.map((_, i) => i), 9999, { x: LOOKAHEAD + 50.5, y: 0 })).toBeLessThan(LOOKAHEAD); // hors de la fenêtre : on ne saute pas jusque-là
    expect(currentSegment(many, ln, 200, { x: 150.5, y: 0 }, 140)).toBe(150);
    const loop = [{ x0: 0, y0: 0, x1: 10, y1: 0, cut: true }, { x0: 10, y0: 0, x1: 0, y1: 0, cut: true }]; // un trait qui revient sur lui-même
    expect(currentSegment(loop, [0, 1], 99, { x: 5, y: 0 })).toBe(0); // à égalité (à 0,3 mm près) : le premier
  });
});

import { finishedSegments, segmentGroups } from '../src/components/GcodePreview/helpers';

describe('segmentGroups / finishedSegments : une pièce passe en pointillé quand elle est finie', () => {
  const cutSeg = (x: number, piece?: string) => ({ x0: x, y0: 0, x1: x + 1, y1: 0, cut: true, ...(piece ? { piece } : {}) });
  const rapid = (x: number) => ({ x0: x, y0: 0, x1: x + 1, y1: 0, cut: false });
  it('par nom de pièce : trous et contour extérieur ensemble, rapides et gravure à part', () => {
    const segs = [rapid(0), cutSeg(1, 'A'), cutSeg(2, 'A'), rapid(3), cutSeg(4, 'A'), rapid(5), cutSeg(6, 'B'), { ...cutSeg(7), engrave: true }];
    const g = segmentGroups(segs);
    expect(g.id).toEqual([-1, 0, 0, -1, 0, -1, 1, -1]);
    expect(g.last).toEqual([4, 6]);
    expect(finishedSegments(segs, g, 4).done).toEqual([]); // la pièce A est en cours : rien n'est fini
    expect(finishedSegments(segs, g, 5).done).toEqual([segs[1], segs[2], segs[4]]); // la tête est passée à la pièce suivante
    expect(finishedSegments(segs, g, 99).done).toHaveLength(4);
    expect(finishedSegments(segs, g, 5).rest).toHaveLength(5);
  });
  it('sans nom de pièce (G-code importé) : un groupe par suite de traits de coupe', () => {
    const segs = [rapid(0), cutSeg(1), cutSeg(2), rapid(3), cutSeg(4)];
    const g = segmentGroups(segs);
    expect(g.id).toEqual([-1, 0, 0, -1, 1]);
    expect(g.last).toEqual([2, 4]);
    expect(finishedSegments(segs, g, 3).done).toEqual([segs[1], segs[2]]);
  });
});
