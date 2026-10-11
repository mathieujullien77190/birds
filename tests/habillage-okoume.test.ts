import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { nestSheets, sheetLabel, type Plank } from '@/birdhouse/model';
import { VARIANTS, buildNest } from './helpers';
import { aabb, obb } from './geomChecks';

const corners = (p: Plank, t: number): Vector3[] => { const b = obb(p, t); return [-1, 1].flatMap((a) => [-1, 1].flatMap((c) => [-1, 1].map((d) => b.c.clone().addScaledVector(b.ax[0], a * b.h[0]).addScaledVector(b.ax[1], c * b.h[1]).addScaledVector(b.ax[2], d * b.h[2])))); };
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

describe('boîte carrée crénelée de la caméra 2 (okoumé 5 mm peint)', () => {
  const sc = buildNest({}), t = sc.t, box = sc.planks.filter((p) => /^Boîte caméra 2/.test(p.name));
  it('six plaques crénelées en okoumé, avec trou d\'objectif, fenêtre des LED et fente latérale ; carrée en plan', () => {
    expect(box).toHaveLength(6);
    for (const p of box) { expect(p.material).toBe('okoume'); expect(p.depth).toBe(5); expect(p.color).toBe('#f5f5f4'); expect(p.notches.length, p.name).toBeGreaterThan(2); expect(p.notches.every((n) => n.depth === 5), p.name).toBe(true); }
    const f = box.find((p) => /face avant/.test(p.name))!, top = box.find((p) => /dessus/.test(p.name))!;
    expect(f.holes.map((h) => h.size).sort((a, b) => a - b)).toEqual([10, 12]); expect(top.holes).toHaveLength(0); // plus de fente au-dessus : nappe et fils passent par le côté
    expect(box.filter((p) => p.holes.length === 1 && /côté/.test(p.name))).toHaveLength(1);
    expect(top.w).toBe(top.h);
  });
  it('contient la caméra 2 et la carte de LED, sans toucher l\'habillage ni le pan de chêne', () => {
    const oak = sc.planks.find((p) => p.name === 'Toit en chêne')!, lames = sc.planks.filter((p) => /^Lambris (avant|gauche)/.test(p.name));
    const cam = sc.planks.find((p) => p.special === 'camera' && /2/.test(p.name))!, ir = sc.planks.find((p) => p.name === 'LED infrarouges extérieures')!;
    const mn = new Vector3(1e9, 1e9, 1e9), mx = new Vector3(-1e9, -1e9, -1e9);
    for (const p of box) for (const c of corners(p, t)) { mn.min(c); mx.max(c); }
    for (const c of [...corners(cam, t), ...corners(ir, t)]) for (const k of ['x', 'y', 'z'] as const) { expect(c[k]).toBeGreaterThan(mn[k] - 0.01); expect(c[k]).toBeLessThan(mx[k] + 0.01); }
    for (const p of box) for (const c of corners(p, t)) {
      expect(belowOak(oak, c, t), p.name + ' sous le pan').toBeGreaterThanOrEqual(1.5);
      for (const l of lames) { const A = aabb(l, t); expect(c.x > A.min.x && c.x < A.max.x && c.y > A.min.y && c.y < A.max.y && c.z > A.min.z && c.z < A.max.z, `${p.name} dans ${l.name}`).toBe(false); }
    }
    const front = Math.min(...lames.filter((l) => /avant/.test(l.name)).map((l) => aabb(l, t).min.y));
    expect(mx.y, 'collée à la façade : contact, sans pénétration').toBeLessThanOrEqual(front + 1e-6); expect(mx.y, 'collée à la façade').toBeGreaterThanOrEqual(front - 0.3);
    // contact aussi sur les autres tailles de nichoir
    for (const over of [{ hole: 120 }, { l: 200, L: 200 }]) {
      const s2 = buildNest(over), b2 = s2.planks.filter((p) => /^Boîte caméra 2/.test(p.name)), f2 = Math.min(...s2.planks.filter((l) => /^Lambris avant/.test(l.name)).map((l) => aabb(l, s2.t).min.y));
      const m2 = Math.max(...b2.flatMap((p) => corners(p, s2.t).map((c) => c.y)));
      expect(m2).toBeLessThanOrEqual(f2 + 1e-6); expect(m2).toBeGreaterThanOrEqual(f2 - 0.3);
    }
  });
});

describe('lames de l\'habillage : aucun petit bout de bois au-dessus d\'une fenêtre', () => {
  const inPoly = (pt: [number, number], poly: [number, number][]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
  for (const [nom, over] of Object.entries(VARIANTS)) it(`(${nom}) le bois au-dessus de la fenêtre la plus haute fait au moins 15 mm, ou la lame s'arrête au bas de la fenêtre`, () => {
    const sc = buildNest(over);
    for (const l of sc.planks.filter((p) => /^Lambris (avant|arrière)/.test(p.name))) {
      const poly = l.poly ?? [], solid = (x: number, y: number) => inPoly([x, y], poly) && !l.holes.some((h) => h.shape === 'round' ? Math.hypot(x - h.x, y - h.y) < h.size / 2 : Math.abs(x - h.x) < h.size / 2 && Math.abs(y - (h.y)) < (h.sh ?? h.size) / 2);
      for (let x = -l.w / 2 + 0.5; x < l.w / 2; x += 1) {
        // du haut vers le bas : longueur de la première coulée de bois qui sort du haut de la lame, puis y a-t-il du vide en dessous (une fenêtre) ?
        let top = l.h / 2, y = top - 0.25, run = 0;
        while (y > -l.h / 2 && solid(x, y)) { run += 0.5; y -= 0.5; }
        const gapBelow = y > -l.h / 2 + 0.5;
        let wv = 1; for (const dir of [-1, 1]) for (let xx = x + dir; Math.abs(xx) < l.w / 2 && !solid(xx, y - 0.25); xx += dir) wv++; // largeur du vide : une fente étroite (nervure, barre) laisse un pont qui tient, pas une languette
        if (gapBelow && run > 0.25 && wv >= 15) expect(run, `${l.name} x=${x.toFixed(1)} : bout de ${run} mm au-dessus d'un vide`).toBeGreaterThanOrEqual(15);
      }
    }
  });
});
