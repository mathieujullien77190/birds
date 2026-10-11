import { describe, expect, it } from 'vitest';
import { nestSheets } from '@/birdhouse/model';
import { VARIANTS, buildNest } from './helpers';

describe('le toit n\'est plus verrouillé par des barres de MDF (il tient avec l\'habillage collé au corps)', () => {
  for (const [nom, over] of Object.entries(VARIANTS)) {
    it(`(${nom}) aucune barre, aucune pièce en MDF, aucun trou ni encoche de barre`, () => {
      const sc = buildNest(over), t = sc.t;
      expect(sc.planks.filter((p) => /^Barre /.test(p.name) || p.material === 'mdf')).toEqual([]);
      expect(nestSheets(sc, 410, 400).filter((s) => s.material === 'mdf')).toEqual([]);
      // murs extérieurs avant / arrière : plus de trou 10 × t ; cadre du toit : plus d'encoche 10 de large (seule reste l'ouverture en U)
      for (const p of sc.planks.filter((q) => /^(Face avant|Face arrière) ext/.test(q.name))) expect(p.holes.filter((h) => h.size === 10 && h.sh === t), p.name).toEqual([]);
      for (const p of sc.planks.filter((q) => /^Cadre toit/.test(q.name))) { expect(p.notches.filter((x) => x.width === 10), p.name).toEqual([]); expect(p.notches, p.name).toHaveLength(1); }
      // lambris : plus de fenêtre de 10,5 × (t + 1) (pas de lambeau)
      for (const l of sc.planks.filter((q) => /^Lambris (avant|arrière)/.test(q.name))) expect(l.holes.filter((h) => h.size === 10.5 && h.sh === t + 1), l.name).toEqual([]);
    });
  }
});
