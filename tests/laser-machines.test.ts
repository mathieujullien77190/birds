import { describe, expect, it } from 'vitest';
import { nestSheets } from '@/birdhouse/model';
import { LASER_MACHINES } from '@/features/laser/constants';
import { buildNest } from './helpers';

describe('machines laser connues', () => {
  it('les deux zones de gravure : S30 Pro 410 × 400, S30 Ultra 590 × 595', () => {
    expect(LASER_MACHINES.map((m) => [m.id, m.W, m.H])).toEqual([['s30-pro', 410, 400], ['s30-ultra', 590, 595], ['board-400', 400, 400]]);
  });
  it('contreplaqué 3 mm : toutes les pièces tiennent sur chaque planche et il faut 10 planches de 3 mm (410 × 400 comme 400 × 400, avec la marge de 8 mm) ; la grande planche en demande moins', () => {
    const sc = buildNest({});
    const plies = LASER_MACHINES.map((m) => {
      const sheets = nestSheets(sc, m.W, m.H, 5).filter((s) => s.material !== 'okoume'); // les lames d'okoumé (399 mm de haut) ont leurs propres planches
      for (const s of sheets) for (const it of s.items) { expect(it.x + it.w, `${m.id} ${it.plank.name}`).toBeLessThanOrEqual(m.W + 0.001); expect(it.y + it.h, `${m.id} ${it.plank.name}`).toBeLessThanOrEqual(m.H + 0.001); }
      return sheets.length;
    });
    expect(plies[0]).toBe(plies[2]); // une planche de 400 × 400 vaut une de 410 × 400 pour ces pièces
    expect(plies[1]).toBeLessThan(plies[0]);
  });
});
