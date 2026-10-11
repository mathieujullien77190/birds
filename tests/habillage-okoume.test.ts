import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { nestSheets, sheetLabel, type Plank } from '@/birdhouse/model';
import { VARIANTS, buildNest } from './helpers';
import { aabb, obb } from './geomChecks';

/** Sommets réels du contour de la plaque (poly ou rectangle), sur les deux faces. */
const outlineCorners = (p: Plank, t: number): Vector3[] => { const b = obb(p, t), pts = p.poly ?? [[-p.w / 2, -p.h / 2], [p.w / 2, -p.h / 2], [p.w / 2, p.h / 2], [-p.w / 2, p.h / 2]]; return pts.flatMap(([x, y]) => [-1, 1].map((d) => b.c.clone().addScaledVector(b.ax[0], x).addScaledVector(b.ax[1], y).addScaledVector(b.ax[2], d * (p.depth ?? t) / 2))); };
/** Distance signée d'un point au-dessous du dessous du pan de chêne (> 0 : sous le pan). */
const belowOak = (oak: Plank, pt: Vector3, t: number) => { const b = obb(oak, t), n = b.ax[2].clone(); if (n.z < 0) n.negate(); return -(pt.clone().sub(b.c).dot(n)) - oak.depth! / 2; };

describe('habillage en contreplaqué okoumé extérieur 5 mm, peint en blanc, découpé au laser', () => {
  for (const [nom, over] of Object.entries(VARIANTS)) {
    it(`(${nom}) lames en okoumé de 5 mm, blanches, sur leurs propres planches, sans recouvrement`, () => {
      const sc = buildNest(over), t = sc.t, lames = sc.planks.filter((p) => /^Lambris /.test(p.name));
      expect(lames.length).toBeGreaterThan(15);
      for (const l of lames) { expect(l.material, l.name).toBe('okoume'); expect(l.depth, l.name).toBe(5); expect(l.special, l.name).toBeUndefined(); expect(l.color).toBe('#f5f5f4'); }
      const sheets = nestSheets(sc, 410, 400), ok = sheets.filter((s) => s.material === 'okoume');
      expect(ok.length).toBeGreaterThanOrEqual(1);
      const placed = ok.flatMap((s) => s.items.map((i) => i.plank.name));
      for (const l of lames) expect(placed, l.name).toContain(l.name);
      const fits = Math.max(...lames.map((l) => Math.min(l.w, l.h))) <= 380 && Math.max(...lames.map((l) => Math.max(l.w, l.h))) <= 392; // une variante très haute a des lames plus grandes que la planche (signalées par `used` > 1)
      for (const s of fits ? ok : []) { expect(s.used, 'tient dans la planche').toBeLessThanOrEqual(1); for (const i of s.items) { expect(i.x).toBeGreaterThanOrEqual(0); expect(i.x + i.w).toBeLessThanOrEqual(410 + 1e-6); expect(i.y + i.h).toBeLessThanOrEqual(400 + 1e-6); } }
      expect(sheetLabel(sheets, sheets.indexOf(ok[0]))).toBe('Planche okoumé 5 mm 1');
      for (const s of sheets.filter((x) => x.material !== 'okoume')) for (const i of s.items) expect(i.plank.material).not.toBe('okoume');
      // aucun recouvrement entre lames (des boîtes alignées sur les axes : voisines au plus au contact)
      for (let a = 0; a < lames.length; a++) for (let b = a + 1; b < lames.length; b++) {
        const A = aabb(lames[a], t), B = aabb(lames[b], t), o = (ax: 'x' | 'y' | 'z') => Math.min(A.max[ax], B.max[ax]) - Math.max(A.min[ax], B.min[ax]);
        expect(o('x') > 0.01 && o('y') > 0.01 && o('z') > 0.01, `${lames[a].name} / ${lames[b].name}`).toBe(false);
      }
    });

    it(`(${nom}) le haut de la façade reste sous le dessous du pan de chêne, l'arrière et les côtés ne le percent pas`, () => {
      const sc = buildNest(over), t = sc.t, oak = sc.planks.find((p) => p.name === 'Toit en chêne')!;
      for (const l of sc.planks.filter((p) => /^Lambris /.test(p.name))) {
        const worst = Math.min(...outlineCorners(l, t).filter((c) => c.z > aabb(l, t).max.z - 7).map((c) => belowOak(oak, c, t)));
        expect(worst, l.name).toBeGreaterThanOrEqual(l.name.startsWith('Lambris avant') ? 1.4 : -0.05); // devant : jeu (LAM_FRONT_GAP) ; ailleurs : au plus affleurant
      }
    });
  }
});


