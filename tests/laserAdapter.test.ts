import { describe, expect, it } from 'vitest';
import { CRENEL_SNUG, FRAME_OUTSET, crenelTestPlanks, makeNest, NEST_DEFAULT, nestSheets, sheetFrame, sheetLabel } from '@/birdhouse/model';
import { HOLE_SHRINK, shrinkHole, sheetsToItems, sheetToJob } from '../src/features/laser/adapter';
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

  it("le cadre bleu entoure au plus juste toutes les pièces de la planche (2 mm autour), gravé en premier, avant les codes", () => {
    const sh = sheets[0], job = sheetToJob(sh, W, H), fr = sheetFrame(sh)!;
    expect(fr.x0).toBeCloseTo(Math.min(...sh.items.map((it) => it.x)) - FRAME_OUTSET, 9);
    expect(fr.x1).toBeCloseTo(Math.max(...sh.items.map((it) => it.x + it.w)) + FRAME_OUTSET, 9);
    expect(job.layers.engrave![0]).toEqual([[fr.x0, H - fr.y0], [fr.x1, H - fr.y0], [fr.x1, H - fr.y1], [fr.x0, H - fr.y1]]);
    expect(job.layers.engrave!.length).toBeGreaterThan(1); // les codes suivent
    expect(sheetFrame({ items: [] } as never)).toBeNull();
    expect(sheetToJob({ items: [] } as never, W, H).layers.engrave).toBeUndefined(); // planche vide : rien à graver
  });

  it("les trous sont découpés 0,3 mm plus petits en largeur et en hauteur, autour de leur centre ; les très petits trous restent tels quels", () => {
    const circle: [number, number][] = Array.from({ length: 36 }, (_, i) => [10 + 4 * Math.cos((i / 36) * 2 * Math.PI), 20 + 4 * Math.sin((i / 36) * 2 * Math.PI)]); // trou de 8 mm
    const out = shrinkHole(circle), size = (pts: [number, number][], k: 0 | 1) => Math.max(...pts.map((q) => q[k])) - Math.min(...pts.map((q) => q[k]));
    expect(size(out, 0)).toBeCloseTo(size(circle, 0) - HOLE_SHRINK, 9);
    expect(size(out, 1)).toBeCloseTo(size(circle, 1) - HOLE_SHRINK, 9);
    expect((Math.max(...out.map((q) => q[0])) + Math.min(...out.map((q) => q[0]))) / 2).toBeCloseTo(10, 9); // même centre
    const tiny: [number, number][] = [[0, 0], [0.4, 0], [0.4, 0.4], [0, 0.4]]; // 0,4 mm : moins de 2,5 × le retrait
    expect(shrinkHole(tiny)).toBe(tiny);
    const sh = sheets.find((x) => x.items.some((it) => it.holes.length))!, it = sh.items.find((q) => q.holes.length)!;
    const job = sheetToJob(sh, W, H), piece = job.pieces!.find((pc) => pc.name === it.plank.name)!;
    const hh = (pts: [number, number][]) => Math.max(...pts.map((q) => q[0])) - Math.min(...pts.map((q) => q[0]));
    expect(hh(piece.contours[1])).toBeCloseTo(hh(it.holes[0]) - (hh(it.holes[0]) > HOLE_SHRINK * 2.5 ? HOLE_SHRINK : 0), 6); // le contour extérieur ne change pas, le trou rétrécit
  });

  it('les libellés et les noms de fichiers suivent les planches (MDF compris)', () => {
    const items = sheetsToItems(sheets, W, H);
    expect(items.map((i) => i.label)).toEqual(sheets.map((_, i) => sheetLabel(sheets, i)));
    expect(items.map((i) => i.fileName)).toEqual(sheets.map((_, i) => `planche-${i + 1}`));
  });

  it("la planche « Essai boîte » ne contient que les deux plaques à crans, avec leur code gravé", () => {
    const extras = crenelTestPlanks(sc), items = nestSheets(sc, W, H, 5, 8, () => false, extras).flatMap((sh) => sh.items);
    expect(items.map((it) => it.code).sort()).toEqual(['CR-01', 'CR-02']);
    expect(items.every((it) => it.engrave?.length)).toBe(true);
  });

  it("deux plaques d'essai de la moitié de P-07 s'emboîtent : crans complémentaires, mêmes dimensions, codes CR-01 et CR-02", () => {
    const [a, b] = crenelTestPlanks(sc);
    const ref = nest.planks.find((p) => p.name === "Bouchon-boîte prise d'air 2")!;
    expect([a.plank.w, a.plank.h]).toEqual([ref.w, Math.round((ref.h / 2) * 100) / 100]);
    expect([b.plank.w, b.plank.h]).toEqual([a.plank.w, a.plank.h]);
    expect([a.code, b.code]).toEqual(['CR-01', 'CR-02']);
    const pos = (p: typeof a.plank, edge: string) => p.notches.filter((n) => n.edge === edge).map((n) => n.pos);
    for (const edge of ['left', 'right']) { // une dent sur deux est creusée, l'autre plaque creuse les dents restantes
      const x = pos(a.plank, edge), y = pos(b.plank, edge), seg = a.plank.h / a.plank.cast![edge as 'left']!.n;
      expect(x.length + y.length).toBe(a.plank.cast![edge as 'left']!.n);
      for (const px of x) expect(y.every((py) => Math.abs(px - py) >= seg - 1e-6)).toBe(true);
    }
    expect(a.plank.notches.every((n) => n.depth === 3)).toBe(true); // épaisseur du bois
    expect(CRENEL_SNUG).toBe(-0.2); // crans plus étroits que les dents : ajustement serré
    const seg = a.plank.h / a.plank.cast!.left!.n;
    expect(a.plank.notches.every((n) => Math.abs(n.width - (seg + CRENEL_SNUG)) < 0.01 || Math.abs(n.width - (seg + CRENEL_SNUG / 2)) < 0.01)).toBe(true); // resserré des deux côtés, d'un seul côté au bout du bord
    expect(crenelTestPlanks({ t: 3, fit: 0.2, planks: [] })).toEqual([]); // sans plaque de référence, rien
  });

  it("les pièces sont calées vers l'origine de la laser : le bas de la planche touche la marge", () => {
    for (const sh of sheets.filter((x) => x.used <= 1)) expect(Math.max(...sh.items.map((it) => it.y + it.h))).toBeCloseTo(H - 8, 6);
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
