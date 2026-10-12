import { describe, expect, it } from 'vitest';
import { VARIANTS, buildNest } from './helpers';
import { ligament } from './geomLigament';

/** La gaine ICTA Ø 16 traverse le fond et le plancher du corps par des trous Ø 16 (serrée) et la zone du toit par des trous Ø 18 (elle y passe sans effort). */
describe('trous de la gaine des fils', () => {
  for (const [name, over] of Object.entries(VARIANTS)) {
    const sc = buildNest(over);
    const gaine = sc.planks.find((p) => /^Gaine des fils/.test(p.name))!;
    const [gx, gy] = [gaine.path![0][0], gaine.path![0][1]];
    for (const [re, size] of [[/^(Dessous ext|Plancher int)$/, 16], [/^(Cadre toit (haut|milieu|bas)|Dessous toit|Dessus toit)$/, 18]] as [RegExp, number][]) {
      it(`${name} : ${re.source} → trou de Ø ${size}, centré sur la gaine, ligaments de bois ≥ 4,5 mm`, () => {
        const pl = sc.planks.filter((p) => re.test(p.name));
        expect(pl.length).toBeGreaterThanOrEqual(2);
        for (const p of pl) {
          const h = p.holes.find((q) => q.shape === 'round' && Math.abs(p.pos[0] + q.x - gx) < 0.02 && Math.abs(p.pos[1] + q.y - gy) < 0.02);
          expect(h, p.name).toBeDefined();
          expect(h!.size, p.name).toBe(size);
          expect(ligament(p, h!).min, p.name).toBeGreaterThanOrEqual(4.5);
        }
      });
    }
  }
});
