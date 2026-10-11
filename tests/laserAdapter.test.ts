import { describe, expect, it } from 'vitest';
import { makeNest, NEST_DEFAULT, nestSheets, sheetLabel } from '@/birdhouse/model';
import { sheetsToItems, sheetToJob } from '../src/features/laser/adapter';
import { buildGcode, jobBox } from '@laser';

/** L'adaptateur de l'app : planches du nichoir → LaserJob de laser-control (origine en bas à gauche, trous avant contours, plafond respecté). */
describe('adaptateur laser-control', () => {
  const nest = makeNest(NEST_DEFAULT, 3, 0.2, 1);
  const sc = { t: 3, fit: 0.2, planks: nest.planks, groupNames: nest.groupNames } as never;
  const W = 410, H = 400;
  const sheets = nestSheets(sc, W, H, 5);

  it('une planche donne un travail à la taille de la planche, avec une pièce par plaque et tous les contours dans la couche de coupe', () => {
    const job = sheetToJob(sheets[0], W, H);
    expect([job.widthMm, job.heightMm]).toEqual([W, H]);
    expect(job.pieces).toHaveLength(sheets[0].items.length);
    expect(job.layers.cut).toHaveLength(job.pieces!.reduce((n, p) => n + p.contours.length, 0));
    const box = jobBox(job)!;
    expect(box.minX).toBeGreaterThanOrEqual(0);
    expect(box.maxY).toBeLessThanOrEqual(H);
  });

  it('les libellés et les noms de fichiers suivent les planches (MDF compris)', () => {
    const items = sheetsToItems(sheets, W, H);
    expect(items.map((i) => i.label)).toEqual(sheets.map((_, i) => sheetLabel(sheets, i)));
    expect(items.map((i) => i.fileName)).toEqual(sheets.map((_, i) => `planche-${i + 1}`));
  });

  it('le G-code d\'une planche finit par M5, ne dépasse pas le plafond et reste dans la planche', () => {
    for (const it of sheetsToItems(sheets, W, H)) {
      const g = buildGcode(it.job!, { feed: 300, powerPct: 100, passes: 2, passMode: 'all', sMax: 1000, capPct: 70 });
      expect(g.lines[g.lines.length - 1]).toBe('M5');
      expect(g.stats.maxS).toBeLessThanOrEqual(700);
      expect(g.stats.outOfBounds).toBe(false);
    }
  });
});
