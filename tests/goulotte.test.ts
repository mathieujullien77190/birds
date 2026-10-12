import { describe, expect, it } from 'vitest';
import type { Plank } from '@/birdhouse/model';
import { VARIANTS, buildNest } from './helpers';
import { ligament } from './geomLigament';
import { aabb } from './geomChecks';

/** Goulotte (siège fixe du ventilateur) : paroi avant et deux côtés crénelés entre eux (U d'un seul bloc), rien à l'arrière ; dents du bas dans le plancher du toit. */
describe('goulotte du ventilateur : crénelage entre les parois', () => {
  for (const [name, over] of Object.entries(VARIANTS)) {
    const sc = buildNest(over), t = sc.t;
    const get = (re: RegExp): Plank => { const l = sc.planks.filter((p) => re.test(p.name)); expect(l, String(re)).toHaveLength(1); return l[0]; };
    const av = get(/^Goulotte ventilateur avant$/), g = get(/^Goulotte ventilateur gauche$/), d = get(/^Goulotte ventilateur droite$/);
    it(`${name} : dents impaires alternées (avant phase 0, côtés phase 1) sur les arêtes verticales communes, aucune à l'arrière ni en haut`, () => {
      const n = av.cast!.left!.n;
      expect(n % 2).toBe(1); expect(n).toBeGreaterThanOrEqual(3);
      expect(av.cast!.left).toEqual({ n, phase: 0 }); expect(av.cast!.right).toEqual({ n, phase: 0 });
      for (const s of [g, d]) {
        expect(s.cast!.left).toEqual({ n, phase: 1 }); // arête avant (x local = y monde, bas → petit y)
        expect(s.cast!.right).toBeUndefined(); expect(s.cast!.top).toBeUndefined(); // rien à l'arrière ni en haut
        expect(s.notches.filter((k) => k.edge === 'right' || k.edge === 'top')).toEqual([]);
        expect(s.cast!.bottom).toBeDefined();
      }
      expect(av.cast!.top).toBeUndefined();
      // les crans de l'avant (phase 0) et ceux des côtés (phase 1) sont complémentaires : à chaque hauteur, un seul des deux est creusé
      const pos = (p: Plank, e: 'left' | 'right') => p.notches.filter((k) => k.edge === e).map((k) => k.pos).sort((a, b) => a - b);
      const seg = av.h / n;
      expect(pos(av, 'left')).toEqual(Array.from({ length: n }, (_, i) => i).filter((i) => i % 2 === 0).map((i) => +((i + 0.5) * seg).toFixed(2)));
      expect(pos(g, 'left')).toEqual(Array.from({ length: n }, (_, i) => i).filter((i) => i % 2 === 1).map((i) => +((i + 0.5) * seg).toFixed(2)));
      expect(pos(av, 'left')).toEqual(pos(av, 'right'));
    });
    it(`${name} : l'intérieur du siège est inchangé (la cassette entre à jeu 0), la paroi avant couvre toute la largeur extérieure`, () => {
      const c = sc.planks.find((p) => /^Cassette ventilateur couvercle/.test(p.name))!;
      const inner = aabb(d, t).min.x - aabb(g, t).max.x;
      expect(inner).toBeCloseTo(c.w, 1); // intérieur du siège = largeur de la cassette
      expect(av.w).toBeCloseTo(aabb(d, t).max.x - aabb(g, t).min.x, 1);
      expect(aabb(g, t).max.y).toBeCloseTo(aabb(d, t).max.y, 5);
    });
    it(`${name} : ligaments de bois ≥ 3 mm entre les fentes des dents dans le plancher du toit, et prise mâle en face de la femelle sans toucher les dents`, () => {
      const floor = get(/^Dessous toit$/);
      const x0 = aabb(g, t).min.x - 6, x1 = aabb(d, t).max.x + 6, y0 = aabb(av, t).min.y - 6, y1 = aabb(g, t).max.y + 6;
      const near = floor.holes.filter((h) => { const x = floor.pos[0] + h.x, y = floor.pos[1] + h.y; return x > x0 && x < x1 && y > y0 && y < y1 && !(h.shape === 'round'); });
      expect(near.length).toBeGreaterThan(0);
      for (const h of near) expect(ligament(floor, h).min, `fente ${h.x},${h.y}`).toBeGreaterThanOrEqual(3);
      const male = get(/^Rallonge ventilateur 4 broches : prise mâle/), fem = get(/^Prise 4 broches du ventilateur/);
      const mb = aabb(male, t), ab = aabb(av, t);
      expect(Math.abs((mb.min.x + mb.max.x) / 2 - (aabb(fem, t).min.x + aabb(fem, t).max.x) / 2)).toBeLessThan(0.5); // en face de la femelle
      expect(mb.min.x).toBeGreaterThan(ab.min.x + t + 2); expect(mb.max.x).toBeLessThan(ab.max.x - t - 2); // loin des dents des arêtes verticales
    });
  }
});
