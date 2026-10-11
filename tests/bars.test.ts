import { describe, expect, it } from 'vitest';
import { holeOutline, nestSheets, outline, sheetLabel, type Plank, type Pt } from '@/birdhouse/model';
import { HIDDEN_AT_CREATION } from '@/features/viewer/constants';
import { VARIANTS, buildNest } from './helpers';
import { aabb } from './geomChecks';
import { ligament } from './geomLigament';

const inPoly = (pt: Pt, poly: Pt[]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
/** Y a-t-il de la matière du lambris (lame debout face avant / arrière) au point (x, z) ? */
const lamberMaterial = (l: Plank, x: number, z: number) => { const p: Pt = [x - l.pos[0], z - l.pos[2]]; return inPoly(p, l.poly ?? outline(l)) && !l.holes.some((h) => inPoly(p, holeOutline(h))); };

describe('barres du toit en MDF 3 mm, découpées au laser, à fleur du lambris', () => {
  for (const [nom, over] of Object.entries(VARIANTS)) {
    it(`(${nom}) quatre barres de 55 × 10 en MDF, cachées par défaut, qui s'engagent pile dans les trous des murs et les encoches du cadre, à fleur du lambris`, () => {
      const sc = buildNest(over), t = sc.t, bars = sc.planks.filter((p) => /^Barre /.test(p.name));
      expect(bars.map((b) => b.name).sort()).toEqual(['avant droite', 'avant gauche', 'arrière droite', 'arrière gauche'].map((n) => `Barre ${n} (MDF 3 mm)`).sort());
      const lam = sc.planks.filter((p) => /^Lambris (avant|arrière)/.test(p.name)), faceY = (front: boolean) => { const l = lam.filter((q) => (q.pos[1] > 0) === !front); return l[0].pos[1] + (front ? -1 : 1) * l[0].depth! / 2; }; // face extérieure du lambris
      for (const b of bars) { expect(b.material).toBe('mdf'); expect(b.special).toBeUndefined(); expect([b.w, b.h]).toEqual([55, 10]); expect(HIDDEN_AT_CREATION.some((re) => re.test(b.name)), b.name).toBe(false); }
      const mid = sc.planks.find((p) => p.name === 'Cadre toit milieu')!, walls = sc.planks.filter((p) => /^Face (avant|arrière) ext/.test(p.name));
      expect(mid.notches.filter((n) => n.width === 10)).toHaveLength(4); for (const n of mid.notches.filter((x) => x.width === 10)) expect(n.depth).toBe(47); // l'engagement dans l'encoche reste de 47 mm
      for (const w of walls) expect(w.holes.filter((h) => h.size === 10 && Math.abs((h.sh ?? 0) - t) < 0.5), w.name).toHaveLength(2);
      for (const b of bars) {
        const bb = aabb(b, t), front = b.pos[1] < 0, wall = walls.find((w) => (b.pos[1] > 0) === (w.pos[1] > 0))!, hole = wall.holes.find((h) => h.size === 10 && Math.abs(wall.pos[0] + h.x - b.pos[0]) < 0.6)!;
        expect(hole, b.name).toBeTruthy(); expect(Math.abs(wall.pos[2] + hole.y - b.pos[2]), b.name + ' hauteur').toBeLessThan(0.6);
        const tip = front ? bb.min.y : bb.max.y; expect(Math.abs(tip - faceY(front)), b.name + ' à fleur du lambris').toBeLessThanOrEqual(0.05);
        const inner = front ? bb.max.y : bb.min.y; expect(Math.abs(Math.abs(inner) - (Math.abs(faceY(front)) - 5 - 50)), b.name + ' bout dans l encoche').toBeLessThanOrEqual(0.05); // le bout intérieur est resté au même endroit : 50 mm sous la plaque extérieure
        const hole3 = b.holes.find((h) => h.shape === 'round' && h.size === 3)!; expect(hole3, b.name + ' trou Ø 3').toBeTruthy();
        expect(Math.abs(hole3.x), 'à 6 mm du bout').toBeCloseTo(b.w / 2 - 6, 2); expect(Math.sign(hole3.x) * (front ? -1 : 1)).toBe(1); // côté du bout extérieur
        const lig = ligament(b, hole3).min; expect(lig, b.name + ' ligament du trou Ø 3').toBeGreaterThanOrEqual(3.5 - 1e-6); // 10 mm de large : 3,5 mm de MDF de chaque côté (4,5 mm au bout)
        // fenêtre du lambris : de la taille de la barre + 0,5 mm de chaque côté, pas de matière dedans ; la barre n'est pas gênée
        const zc = b.pos[2], strips = lam.filter((l) => (l.pos[1] > 0) !== front);
        for (const dx of [-5.23, -5, 0, 5, 5.23]) for (const dz of [-t / 2 - 0.48, 0, t / 2 + 0.48]) for (const l of strips) expect(lamberMaterial(l, b.pos[0] + dx, zc + dz), `${b.name} ${dx},${dz} dans ${l.name}`).toBe(false);
        for (const [dx, dz] of [[-5.8, 0], [5.8, 0], [0, t / 2 + 1.2], [0, -t / 2 - 1.2]]) expect(strips.some((l) => lamberMaterial(l, b.pos[0] + dx, zc + dz)), `${b.name} autour de la fenêtre ${dx},${dz}`).toBe(true); // la fenêtre reste petite : le lambris est là tout autour
        // aucune lamelle de moins de 5 mm : la fenêtre est à plus de 5 mm des joints entre lames
        for (const l of strips) { const lb = aabb(l, t); if (b.pos[0] > lb.min.x - 0.01 && b.pos[0] < lb.max.x + 0.01) { expect(b.pos[0] - 5.25 - lb.min.x, l.name).toBeGreaterThanOrEqual(5); expect(lb.max.x - (b.pos[0] + 5.25), l.name).toBeGreaterThanOrEqual(5); } }
      }
      // pas de recouvrement avec les nervures (x = ± 52), la bande des fenêtres arrière ni la fenêtre des prises du Pi : la fenêtre des barres est plus basse que toutes les autres
      const back = lam.filter((l) => l.pos[1] > 0), barZ = bars[0].pos[2], lows = back.map((l) => aabb(l, t).min.z); void lows;
      for (const b of bars) expect(Math.abs(Math.abs(b.pos[0]) - 52), 'loin des nervures').toBeGreaterThan(20);
      expect(barZ).toBeLessThan(Math.min(...sc.planks.filter((p) => /^Lambris arrière/.test(p.name) && aabb(p, t).max.z < 320).map((p) => aabb(p, t).max.z)) - 5);
    });
  }
  it('le MDF a ses propres planches : quatre barres, rien d\'autre ; libellé « Planche MDF 1 »', () => {
    const sc = buildNest({}), sheets = nestSheets(sc, 410, 400), mdf = sheets.filter((s) => s.material === 'mdf');
    expect(mdf).toHaveLength(1); expect(mdf[0].items.map((i) => i.plank.name).sort()).toEqual(sc.planks.filter((p) => p.material === 'mdf').map((p) => p.name).sort()); expect(mdf[0].items).toHaveLength(4);
    for (const s of sheets.filter((x) => !x.material)) for (const i of s.items) expect(i.plank.material).toBeUndefined();
    expect(sheetLabel(sheets, sheets.indexOf(mdf[0]))).toBe('Planche MDF 1');
  });
});
