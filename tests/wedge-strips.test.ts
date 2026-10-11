import { describe, expect, it } from 'vitest';
import { STRIP, bounds, nestSheets, outline, type Plank } from '@/birdhouse/model';
import { VARIANTS, buildNest } from './helpers';
import { aabb } from './geomChecks';

const strips = (sc: { planks: Plank[] }) => sc.planks.filter((p) => /^Baguette de cale \d+$/.test(p.name));

describe('baguettes de cale (à couper au montage) à la place des cales de bois', () => {
  for (const [name, over] of Object.entries(VARIANTS)) {
    const sc = buildNest(over), t = sc.t;
    it(`plus aucune cale de composant, des baguettes de 3 × 5 mm de longueur maximale, hors du nichoir (${name})`, () => {
      expect(sc.planks.filter((p) => /^Cale /.test(p.name))).toEqual([]);
      const list = strips(sc);
      expect(list.length).toBeGreaterThanOrEqual(6);
      expect(t).toBe(3);
      expect(STRIP.length).toBe(394); // planche 410 × 400, marge 8 mm : plus grande dimension utile
      for (const p of list) {
        expect(p.w).toBe(STRIP.length); expect(p.h).toBe(5); expect(p.special).toBeUndefined();
        expect(p.holes).toEqual([]); expect(p.notches).toEqual([]);
        expect(p.group).toBeDefined(); expect(sc.groupNames?.[p.group!]).toBe('Baguettes de cale (à couper)');
      }
      // le triple du besoin : le besoin (somme des anciennes cales : Pi 96, convertisseur 204, interrupteur 96, batterie ≥ 330 mm) est entre 726 et 804 mm
      expect(list.length).toBeGreaterThanOrEqual(Math.ceil((3 * 726) / STRIP.length));
      expect(list.length).toBeLessThanOrEqual(Math.ceil((3 * 804) / STRIP.length));
      expect(new Set(list.map((p) => p.group)).size).toBe(1);
    });
    it(`posées au sol à l'écart du nichoir, sans recouvrement entre elles ni avec les autres pièces (${name})`, () => {
      const list = strips(sc), ids = new Set(list.map((p) => p.id));
      const nest = sc.planks.filter((p) => !ids.has(p.id) && !p.path && p.special !== 'doc' && p.special !== 'solar');
      const house = bounds(nest.filter((p) => !/^(Bloc isolant d'hiver|Isolant bloc|Poignée bloc|Bouchon|Laine bouchon|Poignée bouchon)/.test(p.name)), t);
      for (const p of list) {
        const b = aabb(p, t);
        expect(b.min.z, p.name).toBeCloseTo(0, 5); expect(b.max.z, p.name).toBeCloseTo(t, 5); // à plat sur le sol
        expect(b.max.x, p.name).toBeLessThan(house.min[0] - 100); // loin à gauche du nichoir
        for (const q of sc.planks) {
          if (q === p || q.path || q.special === 'doc') continue;
          const c = aabb(q, t);
          const apart = b.max.x <= c.min.x + 1e-6 || c.max.x <= b.min.x + 1e-6 || b.max.y <= c.min.y + 1e-6 || c.max.y <= b.min.y + 1e-6 || b.max.z <= c.min.z + 1e-6 || c.max.z <= b.min.z + 1e-6;
          expect(apart, `${p.name} / ${q.name}`).toBe(true);
        }
      }
    });
    it(`découpées sur la planche de contreplaqué 3 mm, entières dans la planche (${name})`, () => {
      const W = 410, H = 400, margin = 8;
      const sheets = nestSheets(sc, W, H);
      const found = sheets.flatMap((s, i) => s.items.filter((it) => /^Baguette de cale/.test(it.plank.name)).map((it) => ({ s, i, it })));
      expect(found).toHaveLength(strips(sc).length);
      for (const { s, it } of found) {
        expect(s.material, it.plank.name).toBeUndefined(); // contreplaqué (ni MDF ni okoumé)
        const pts = outline(it.plank);
        expect(Math.max(...pts.map((q) => q[0])) - Math.min(...pts.map((q) => q[0]))).toBeCloseTo(394, 3);
        const w = it.w, h = it.h; // dimensions posées (déjà tournées)
        expect(it.x, it.plank.name).toBeGreaterThanOrEqual(margin - 1e-6); expect(it.y, it.plank.name).toBeGreaterThanOrEqual(margin - 1e-6);
        expect(it.x + w, it.plank.name).toBeLessThanOrEqual(W - margin + 1e-6); expect(it.y + h, it.plank.name).toBeLessThanOrEqual(H - margin + 1e-6);
      }
    });
  }
  it('les cotes de l\'habillage ne comptent que les pièces de l\'habillage (les baguettes n\'y entrent pas)', () => {
    const sc = buildNest({}), lam = Object.entries(sc.groupNames ?? {}).find(([, n]) => n.startsWith('Habillage'))![0];
    expect(strips(sc).some((p) => p.group === lam)).toBe(false);
  });
});
