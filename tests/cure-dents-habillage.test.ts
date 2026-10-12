import { describe, expect, it } from 'vitest';
import type { Plank } from '@/birdhouse/model';
import { buildNest } from './helpers';

/** Cure-dents de positionnement de l'habillage : deux par lame, à z = 6 (hauteur des deux du bas de la lame d'entrée), même trou dans la lame et dans la paroi du corps derrière. */
describe('cure-dents de positionnement de l’habillage', () => {
  const sc = buildNest({});
  const pins = sc.planks.filter((p) => /^Cure-dent habillage \d+$/.test(p.name));
  /** Centre monde (a, z) d'un trou rond de la plaque, a = x (avant / arrière) ou y (côtés). */
  const holeAt = (p: Plank, alongX: boolean) => p.holes.filter((h) => h.shape === 'round' && h.size === 2.2).map((h) => [r((alongX ? p.pos[0] : p.pos[1]) + h.x), r(p.pos[2] + h.y)] as const);
  const r = (n: number) => Math.round(n * 100) / 100;

  it('il y en a deux par lame couvrant z = 6, sur les quatre faces', () => {
    const lames = sc.planks.filter((p) => /^Lambris (avant|arrière|droite|gauche) [\d.]+$/.test(p.name) && !/percé/.test(p.name) && p.pos[2] - p.h / 2 + 4 <= 6 && p.pos[2] + p.h / 2 - 4 >= 6);
    expect(pins).toHaveLength(2 * lames.length);
    expect(pins.length).toBeGreaterThanOrEqual(30);
    for (const l of lames) expect(l.holes.filter((h) => h.size === 2.2), l.name).toHaveLength(2);
  });

  it('chaque cure-dent a son trou dans la lame ET dans la paroi du corps derrière (même position)', () => {
    for (const p of pins) {
      const alongX = Math.abs(p.pos[1]) > Math.abs(p.pos[0]) && Math.abs(p.pos[1]) > 90; // sur la façade ou l'arrière
      const face = alongX ? (p.pos[1] < 0 ? 'Face avant ext' : 'Face arrière ext') : p.pos[0] > 0 ? 'Côté droit ext' : 'Côté gauche ext';
      const a = alongX ? p.pos[0] : p.pos[1];
      const wall = sc.planks.find((q) => q.name === face)!;
      expect(holeAt(wall, alongX).some(([u, z]) => Math.abs(u - a) < 0.02 && Math.abs(z - 6) < 0.02), `${p.name} dans ${face}`).toBe(true);
      const lamName = new RegExp(`^Lambris (${alongX ? (p.pos[1] < 0 ? 'avant' : 'arrière') : p.pos[0] > 0 ? 'droite' : 'gauche'}) \\d`);
      expect(sc.planks.some((q) => lamName.test(q.name) && holeAt(q, alongX).some(([u, z]) => Math.abs(u - a) < 0.02 && Math.abs(z - 6) < 0.02)), `${p.name} dans sa lame`).toBe(true);
    }
  });

  it('un cure-dent de 10 mm : 5 mm de lame, 3 mm de paroi, 2 mm derrière', () => {
    for (const p of pins) { expect(p.special).toBe('pin'); expect(p.depth).toBe(10); expect(p.w).toBe(2); }
  });
});
