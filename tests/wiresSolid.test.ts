import { describe, expect, it } from 'vitest';
import { VARIANTS, buildNest } from './helpers';
import { crossings } from './wireChecks';

describe('aucun fil ne traverse une pièce solide', () => {
  for (const [nom, over] of Object.entries(VARIANTS)) {
    it(`(${nom})`, () => {
      const c = crossings(buildNest(over));
      expect(c.map(([w, s, l]) => `${w} traverse ${s} sur ${l.toFixed(1)} mm`)).toEqual([]);
    });
  }
});
