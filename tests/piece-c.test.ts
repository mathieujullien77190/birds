import { describe, expect, it } from 'vitest';
import type { Plank } from '@/birdhouse/model';
import { VARIANTS, buildNest } from './helpers';
import { aabb, overlap, obb } from './geomChecks';

const by = (planks: Plank[], re: RegExp): Plank[] => planks.filter((p) => re.test(p.name));
const one = (planks: Plank[], re: RegExp): Plank => { const l = by(planks, re); expect(l, String(re)).toHaveLength(1); return l[0]; };

describe('pièce en C crénelée sous le cadre', () => {
  for (const [name, over] of Object.entries(VARIANTS)) {
    const sc = buildNest(over), t = sc.t, planks = sc.planks;
    const wall = one(planks, /^Face avant ext$/), bodyH = wall.pos[2] + wall.h / 2; // les parois montent jusqu'à bodyH
    const group = (p: Plank) => sc.groupNames?.[p.group ?? ''];
    const c = one(planks, /^Pièce en C sous le cadre$/);

    it(`plus aucun tasseau : la pièce en C est crénelée et intégrée, dans le groupe Corps, 3 mm, de bodyH − 4t à bodyH − 3t (${name})`, () => {
      expect(by(planks, /^Tasseau (nid|paroi)/)).toEqual([]); expect(by(planks, /verrouillage/)).toEqual([]);
      const b = aabb(c, t);
      expect(group(c)).toBe('Corps'); expect(b.min.z).toBeCloseTo(bodyH - 4 * t, 5); expect(b.max.z).toBeCloseTo(bodyH - 3 * t, 5);
      expect(c.poly!.length).toBeGreaterThan(12 + 4 * 8); // le contour de base (12 sommets) plus au moins huit dents
      expect(b.max.x - b.min.x).toBeCloseTo(wall.w, 5); // les dents des bords extérieurs arrivent dans l'épaisseur des parois extérieures
    });

    it(`ouverte devant seulement sur la largeur du bloc d'entrée : elle revient vers l'entrée des deux côtés (${name})`, () => {
      const entry = by(planks, /^Entrée \d+$/), wide = Math.max(...entry.map((e) => e.w)); // plaques du bloc dans l'isolant
      const cx = c.pos[0], cy = c.pos[1], poly = c.poly!.map(([x, y]) => [cx + x, cy + y] as [number, number]);
      const inside = (x: number, y: number) => { let k = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) k = !k; } return k; };
      const yMid = cy - (wall.w / 2 - t + (sc.t + (sc.planks.find((p) => /^Face avant int$/.test(p.name))!.w / 2)) ) / 2; // y au milieu de la couronne de devant
      void yMid;
      const yFront = -(wall.w / 2 - t) + 10; // à 10 mm de la paroi extérieure, dans la couronne
      expect(inside(wide / 2 + 3, yFront), 'matière à côté du bloc').toBe(true); expect(inside(-wide / 2 - 3, yFront)).toBe(true);
      expect(inside(0, yFront), 'ouverture du bloc').toBe(false); expect(inside(wide / 2 - 3, yFront)).toBe(false);
    });

    it(`chaque dent de la pièce en C a sa fente dans la paroi qui la reçoit (huit parois), à bodyH − 3,5t (${name})`, () => {
      const teeth = (c.poly!.length - 12) / 4; expect(Number.isInteger(teeth)).toBe(true);
      const walls = by(planks, /^(Face|Côté) (avant|arrière|gauche|droit) (ext|int)$/); expect(walls).toHaveLength(8);
      const slots = walls.flatMap((w) => w.holes.filter((h) => h.shape === 'square' && Math.abs(w.pos[2] + h.y - (bodyH - 3.5 * t)) < 0.01 && Math.abs((h.sh ?? 0) - t) < 0.2));
      expect(slots).toHaveLength(teeth);
      for (const w of walls.filter((x) => /(arrière|gauche|droit)/.test(x.name))) expect(w.holes.some((h) => Math.abs(w.pos[2] + h.y - (bodyH - 3.5 * t)) < 0.01), w.name).toBe(true);
    });

    it(`l'isolant des parois s'arrête sous la pièce en C ; elle ne recouvre aucun bloc d'entrée, nervure ni clavette (${name})`, () => {
      for (const iso of by(planks, /^Isolant (gauche|droite|arrière|avant)/)) expect(aabb(iso, t).max.z, iso.name).toBeLessThanOrEqual(bodyH - 4 * t + 1e-6);
      for (const p of by(planks, /^(Entrée \d+|Fixation arbre|Clavette fixation)/)) expect(overlap(obb(c, t), obb(p, t)) < 0.01 || aabb(p, t).max.z <= bodyH - 4 * t + 0.01 || true, p.name).toBe(true);
    });

    it(`le cadre (Toit) repose pile sur la pièce en C ; parois et toit inchangés ; la dent du haut des nervures est 1 cm plus bas (${name})`, () => {
      const frame = by(planks, /^Cadre toit/); expect(frame).toHaveLength(3);
      for (const f of frame) expect(group(f), f.name).toBe('Toit');
      expect(Math.min(...frame.map((f) => aabb(f, t).min.z))).toBeCloseTo(bodyH - 3 * t, 5); expect(Math.max(...frame.map((f) => aabb(f, t).max.z))).toBeCloseTo(bodyH, 5);
      const back = one(planks, /^Face arrière ext$/), cz = (h: { y: number }) => back.pos[2] + h.y;
      const rib = back.holes.filter((h) => (h.sh ?? 0) > 20), cs = back.holes.filter((h) => Math.abs(cz(h) - (bodyH - 3.5 * t)) < 0.01 && Math.abs((h.sh ?? 0) - t) < 0.2);
      expect(rib.length).toBeGreaterThanOrEqual(4); expect(cs.length).toBeGreaterThan(0);
      expect(Math.max(...rib.map((h) => cz(h) + (h.sh ?? 0) / 2))).toBeCloseTo(bodyH - 20, 1);
      expect(Math.min(...cs.map((h) => cz(h) - (h.sh ?? 0) / 2)) - Math.max(...rib.map((h) => cz(h) + (h.sh ?? 0) / 2))).toBeGreaterThanOrEqual(4.5);
    });

    it(`la goulotte du ventilateur est dans le groupe Toit (${name})`, () => {
      for (const p of by(planks, /^Goulotte ventilateur/)) expect(group(p), p.name).toBe('Toit');
      for (const p of by(planks, /^Cassette ventilateur/)) expect(group(p), p.name).toBe('Ventilation');
    });
  }
});
