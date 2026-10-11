import { describe, expect, it } from 'vitest';
import { nestSheets, sheetLabel } from '@/birdhouse/model';
import { HIDDEN_AT_CREATION } from '@/features/viewer/constants';
import { VARIANTS, buildNest } from './helpers';
import { aabb } from './geomChecks';

describe('barres du toit en MDF 3 mm, découpées au laser', () => {
  for (const [nom, over] of Object.entries(VARIANTS)) {
    it(`(${nom}) quatre barres 50 × 10 en MDF, cachées par défaut, qui s'engagent pile dans les trous des murs et les encoches du cadre`, () => {
      const sc = buildNest(over), t = sc.t, bars = sc.planks.filter((p) => /^Barre /.test(p.name));
      expect(bars.map((b) => b.name).sort()).toEqual(['avant droite', 'avant gauche', 'arrière droite', 'arrière gauche'].map((n) => `Barre ${n} (MDF 3 mm)`).sort());
      for (const b of bars) { expect(b.material).toBe('mdf'); expect(b.special).toBeUndefined(); expect([b.w, b.h]).toEqual([50, 10]); expect(HIDDEN_AT_CREATION.some((re) => re.test(b.name)), b.name).toBe(true); }
      const mid = sc.planks.find((p) => p.name === 'Cadre toit milieu')!, walls = sc.planks.filter((p) => /^Face (avant|arrière) ext/.test(p.name));
      expect(mid.notches.filter((n) => n.width === 10)).toHaveLength(4); // les encoches de 10 × 47
      for (const n of mid.notches.filter((x) => x.width === 10)) expect(n.depth).toBe(47);
      for (const w of walls) { const holes = w.holes.filter((h) => h.size === 10 && Math.abs((h.sh ?? 0) - t) < 0.5); expect(holes, w.name).toHaveLength(2); } // les trous 10 × t
      for (const b of bars) {
        const bb = aabb(b, t), wall = walls.find((w) => (b.pos[1] > 0) === (w.pos[1] > 0))!, hole = wall.holes.find((h) => h.size === 10 && Math.abs(wall.pos[0] + h.x - b.pos[0]) < 0.6)!;
        expect(hole, b.name).toBeTruthy(); expect(Math.abs(wall.pos[2] + hole.y - b.pos[2]), b.name + ' hauteur').toBeLessThan(0.6); // la barre traverse le trou du mur
        expect(bb.max.z - bb.min.z).toBeCloseTo(t, 2); expect(bb.max.x - bb.min.x).toBeCloseTo(10, 2);
        expect(Math.abs(bb.min.y) > 50 || Math.abs(bb.max.y) > 50).toBe(true); // elle ressort dans la zone des murs et entre dans l'encoche du cadre
      }
    });
  }
  it('le MDF a ses propres planches : quatre barres, rien d\'autre ; libellé « Planche MDF 1 »', () => {
    const sc = buildNest({}), sheets = nestSheets(sc, 410, 400), mdf = sheets.filter((s) => s.material === 'mdf');
    expect(mdf).toHaveLength(1); expect(mdf[0].items.map((i) => i.plank.name).sort()).toEqual(sc.planks.filter((p) => p.material === 'mdf').map((p) => p.name).sort()); expect(mdf[0].items).toHaveLength(4);
    for (const s of sheets.filter((x) => x.material !== 'mdf')) for (const i of s.items) expect(i.plank.material).toBeUndefined();
    expect(sheetLabel(sheets, sheets.length - 1)).toBe('Planche MDF 1');
  });
});
