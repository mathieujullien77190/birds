import { describe, expect, it } from 'vitest';
import type { Plank } from '@/birdhouse/model';
import { VARIANTS, buildNest } from './helpers';
import { aabb } from './geomChecks';

const one = (planks: Plank[], re: RegExp): Plank => { const l = planks.filter((p) => re.test(p.name)); expect(l, String(re)).toHaveLength(1); return l[0]; };

describe('plaque de ventilation arrière (okoumé 5 mm dans l’ouverture de l’habillage)', () => {
  for (const [name, over] of Object.entries(VARIANTS)) {
    const sc = buildNest(over), t = sc.t, planks = sc.planks;
    const plate = one(planks, /^Plaque de ventilation arrière$/), back = one(planks, /^Face arrière toit$/);
    const slots = plate.holes.filter((h) => h.shape === 'square'), pins = plate.holes.filter((h) => h.shape === 'round');
    const wx = (p: Plank, h: { x: number }) => p.pos[0] + h.x, wz = (p: Plank, h: { y: number }) => p.pos[2] + h.y;

    it(`okoumé 5 mm, groupe Habillage, dans le plan des lames arrière, sans recouvrir aucune lame (${name})`, () => {
      expect(plate).toMatchObject({ material: 'okoume', depth: 5 }); expect(sc.groupNames?.[plate.group ?? '']).toBe('Habillage');
      const inside = (poly: [number, number][], x: number, z: number) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
      const pts: [number, number][] = []; for (let u = 0.05; u < 1; u += 0.1) for (let v = 0.05; v < 1; v += 0.1) pts.push([plate.pos[0] - plate.w / 2 + u * plate.w, plate.pos[2] - plate.h / 2 + v * plate.h]);
      for (const l of planks.filter((p) => /^Lambris arrière/.test(p.name))) { expect(l.pos[1], l.name).toBeCloseTo(plate.pos[1], 6); expect(pts.filter(([x, z]) => inside(l.poly!, x - l.pos[0], z - l.pos[2])), `${l.name} : le contour de la lame recouvre la plaque`).toEqual([]); } // les lames s'arrêtent là où la plaque commence
    });
    it(`la grille du ventilateur (à gauche vue de derrière, x > 0) est la même que celle de la plaque arrière ; celle du Pi est à droite (x < 0) (${name})`, () => {
      const exit = back.holes.filter((h) => h.shape === 'square' && h.size === 4 && (h.sh ?? 0) > 30);
      const fan = slots.filter((h) => wx(plate, h) > -20), pi = slots.filter((h) => wx(plate, h) < -20);
      expect(fan.map((h) => r(wx(plate, h))).sort()).toEqual(exit.map((h) => r(wx(back, h))).sort());
      expect(pi.length).toBeGreaterThanOrEqual(8); expect(pi.every((h) => h.size === 4)).toBe(true);
      for (const h of slots) { expect(h.sh).toBe(exit[0].sh); expect(wz(plate, h)).toBeCloseTo(wz(back, exit[0]), 5); }
    });
    it(`la fenêtre des prises du Pi dans la plaque arrière fait la même hauteur que la sortie du ventilateur (${name})`, () => {
      const exit = back.holes.find((h) => h.size === 4 && (h.sh ?? 0) > 30)!, win = back.holes.find((h) => h.size === 60)!;
      expect(win.sh).toBe(exit.sh); expect(win.y).toBeCloseTo(exit.y, 5);
    });
    it(`quatre trous de cure-dent Ø 2,2 aux coins, repris à l’identique dans la plaque arrière du toit, à ≥ 2 mm de tout bord et de toute fente (${name})`, () => {
      expect(pins).toHaveLength(4);
      const back4 = back.holes.filter((h) => h.shape === 'round' && h.size === 2.2);
      expect(back4).toHaveLength(4); for (const h of pins) expect(h.size).toBe(2.2);
      const key = (p: Plank, h: { x: number; y: number }) => `${r(wx(p, h))};${r(wz(p, h))}`;
      expect(pins.map((h) => key(plate, h)).sort()).toEqual(back4.map((h) => key(back, h)).sort());
      const b = aabb(plate, t);
      for (const h of pins) {
        const x = wx(plate, h), z = wz(plate, h);
        expect(Math.min(x - b.min.x, b.max.x - x, z - b.min.z, b.max.z - z) - 1.1, 'bord').toBeGreaterThanOrEqual(2);
        for (const s of slots) expect(Math.max(Math.abs(x - wx(plate, s)) - s.size / 2, Math.abs(z - wz(plate, s)) - (s.sh ?? s.size) / 2) - 1.1, 'fente').toBeGreaterThanOrEqual(2);
      }
    });
  }
});
const r = (v: number) => Math.round(v * 100) / 100;
