import { describe, expect, it } from 'vitest';
import { type Plank } from '@/birdhouse/model';
import { VARIANTS, buildNest } from './helpers';
import { aabb, gap } from './geomChecks';

const T = 3;
const by = (planks: Plank[], re: RegExp): Plank[] => planks.filter((p) => re.test(p.name));
const one = (planks: Plank[], re: RegExp): Plank => { const l = by(planks, re); if (l.length !== 1) throw new Error(`${re} : ${l.length}`); return l[0]; };
const inPoly = (pt: [number, number], poly: [number, number][]): boolean => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };

describe('plaque de verrouillage de l isolant (en C)', () => {
  for (const [nom, over] of Object.entries(VARIANTS)) {
    const planks = buildNest(over).planks;
    const lock = one(planks, /^Plaque de verrouillage de l'isolant$/);
    const walls = by(planks, /^(Face (avant|arrière)|Côté (droit|gauche)) (ext|int)$/);

    it(`(${nom}) les huit parois s arrêtent 3 mm sous le dessous du toit, la plaque occupe ces 3 mm, le dessous du toit n a pas bougé`, () => {
      expect(walls).toHaveLength(8);
      const roofBottom = one(planks, /^Dessous toit$/).pos[2] - T / 2; // bodyH : inchangé
      for (const w of walls) expect(w.pos[2] + w.h / 2, w.name).toBeCloseTo(roofBottom - T, 6);
      expect(lock.pos[2] - T / 2).toBeCloseTo(roofBottom - T, 6);
      expect(lock.pos[2] + T / 2).toBeCloseTo(roofBottom, 6);
      for (const w of by(planks, /^(Face (avant|arrière)|Côté (droit|gauche)) ext$/)) expect(w.pos[2] - w.h / 2, w.name).toBeCloseTo(0, 6); // le bas des parois ne bouge pas
    });

    it(`(${nom}) forme de C : couronne complète sauf à l avant, trou = intérieur du nid, ouverture plus large que le plus large carré du bloc d entrée (+ 1 mm)`, () => {
      const poly = lock.poly as [number, number][];
      expect(poly).toBeTruthy(); expect(lock.holes.every((h) => h.shape === 'round')).toBe(true); // contour unique ; seul le trou de la gaine est un trou
      const nid = one(planks, /^Face avant int$/).w - 2 * T; // intérieur utile
      expect(inPoly([0, 0], poly), 'le centre du nid est ouvert').toBe(false);
      expect(inPoly([0, -lock.h / 2 + 5], poly), 'le milieu du bord avant est ouvert (C)').toBe(false);
      for (const [x, y] of [[lock.w / 2 - 1, 0], [-lock.w / 2 + 1, 0], [0, lock.h / 2 - 1], [nid / 2 + 1, 0], [-nid / 2 - 1, 0], [0, nid / 2 + 1]] as [number, number][]) expect(inPoly([x, y], poly), `couronne en ${x}, ${y}`).toBe(true);
      const entries = by(planks, /^Entrée \d+$/), widest = Math.max(...entries.map((p) => p.w));
      const xs = poly.map(([x]) => Math.abs(x)).filter((x) => x < nid / 2 - 1 && x > 1);
      expect(Math.min(...xs) * 2).toBeGreaterThanOrEqual(widest + 1 - 1e-6); // ouverture ≥ plus large carré + 1 mm
      expect(lock.w).toBe(one(planks, /^Dessous ext$/).w); expect(lock.h).toBe(one(planks, /^Dessous ext$/).h); // même empreinte que le corps
    });

    it(`(${nom}) le bloc d entrée reste enlevable par le haut : aucune de ses pièces n est recouverte par la plaque, ni heurtée`, () => {
      const entries = by(planks, /^Entrée \d+$/), poly = lock.poly as [number, number][];
      expect(entries.length).toBeGreaterThan(10);
      for (const p of entries) {
        const b = aabb(p, T);
        expect(b.max.z, p.name).toBeLessThanOrEqual(lock.pos[2] - T / 2 + 1e-6); // le haut du bloc affleure le haut des parois, sous la plaque
        for (const x of [b.min.x + 0.01, (b.min.x + b.max.x) / 2, b.max.x - 0.01]) for (const y of [b.min.y + 0.01, b.max.y - 0.01]) expect(inPoly([x, y], poly), `${p.name} en ${x.toFixed(1)}, ${y.toFixed(1)}`).toBe(false);
      }
    });

    it(`(${nom}) rien d autre ne traverse la plaque (les parois, l isolant et le cadre la touchent seulement ; le toit repose dessus)`, () => {
      const lb = aabb(lock, T);
      for (const p of planks) {
        if (p === lock || p.special === 'doc' || p.path || /^(Baguette de cale|Lambris|Panneau)/.test(p.name)) continue;
        const b = aabb(p, T);
        const dz = Math.min(b.max.z, lb.max.z) - Math.max(b.min.z, lb.min.z);
        if (dz <= 0.01) continue;
        if (Math.min(b.max.x, lb.max.x) - Math.max(b.min.x, lb.min.x) <= 0.01 || Math.min(b.max.y, lb.max.y) - Math.max(b.min.y, lb.min.y) <= 0.01) continue;
        // même hauteur que la plaque : il faut que sa matière soit hors du contour de la plaque
        const poly = lock.poly as [number, number][];
        const mid: [number, number] = [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2];
        expect(inPoly(mid, poly) && gap(b, lb) === 0 && p.special === undefined && !/^(Rib|Fixation|Clavette)/.test(p.name) ? p.name : '', p.name).toBe('');
      }
    });

    it(`(${nom}) le cadre (3 planches) est sous la plaque, dans le corps, à fleur du haut des parois ; la gaine traverse la plaque`, () => {
      const cadre = by(planks, /^Cadre toit (haut|milieu|bas)$/);
      expect(cadre).toHaveLength(3);
      for (const c of cadre) { expect(c.group, c.name).toBe(lock.group); }
      const tops = cadre.map((c) => c.pos[2] + T / 2); expect(Math.max(...tops)).toBeCloseTo(lock.pos[2] - T / 2, 6);
      const gaine = one(planks, /^Gaine des fils/).path![0];
      expect(lock.holes.some((h) => h.shape === 'round' && Math.abs(h.x - (gaine[0] - lock.pos[0])) < 0.01 && Math.abs(h.y - (gaine[1] - lock.pos[1])) < 0.01), 'trou de la gaine').toBe(true);
    });
  }
});
