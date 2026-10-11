import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { holeOutline, nestSheets, outline, sheetLabel, type Plank } from '@/birdhouse/model';
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

describe('boîte crénelée de la caméra 2 : 5 plaques, collée à plat contre l\'habillage (okoumé 5 mm peint)', () => {
  const sc = buildNest({}), t = sc.t, box = sc.planks.filter((p) => /^Boîte caméra 2/.test(p.name));
  const inPoly = (pt: [number, number], poly: [number, number][]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const solidAt = (p: Plank, w: Vector3): boolean => { const b = obb(p, t), d = w.clone().sub(b.c), x = d.dot(b.ax[0]), y = d.dot(b.ax[1]), z = d.dot(b.ax[2]); return Math.abs(z) < (p.depth ?? t) / 2 && inPoly([x, y], p.poly ?? outline(p)) && !p.holes.some((h) => inPoly([x, y], holeOutline(h))); };
  it('cinq plaques (le côté qui regarde l\'habillage est supprimé), avec trou d\'objectif et fenêtre des LED ; plus de fente latérale', () => {
    expect(box.map((p) => p.name).sort()).toEqual(['face arrière', 'face avant', 'côté gauche', 'dessous', 'dessus'].map((n) => 'Boîte caméra 2 : ' + n).sort());
    for (const p of box) { expect(p.material).toBe('okoume'); expect(p.depth).toBe(5); expect(p.color).toBe('#f5f5f4'); expect(p.notches.length, p.name).toBeGreaterThan(2); expect(p.notches.every((n) => n.depth === 5), p.name).toBe(true); }
    const f = box.find((p) => /face avant/.test(p.name))!;
    expect(f.holes.map((h) => h.size).sort((a, b) => a - b)).toEqual([10, 12]);
    for (const p of box.filter((q) => !/face avant/.test(q.name))) expect(p.holes, p.name).toHaveLength(0); // nappe et fils passent par la face ouverte
  });
  it('bords voisins du côté supprimé droits (sans dents), les autres joints restent crénelés', () => {
    for (const p of box) {
      const adj = /face avant|face arrière|dessus|dessous/.test(p.name);
      if (adj) expect(p.notches.some((n) => n.edge === 'right'), p.name).toBe(false); else expect(p.notches.some((n) => n.edge === 'right'), p.name).toBe(true);
      if (adj) expect(p.cast?.right, p.name).toBeUndefined();
      if (adj) for (const e of ['top', 'bottom'] as const) expect(p.notches.some((n) => n.edge === e) || /dessus|dessous/.test(p.name), p.name + ' ' + e).toBe(true);
      expect(p.notches.some((n) => n.edge === 'left'), p.name).toBe(true);
    }
  });
  it('les plaques s\'emboîtent sans recouvrement (aire commune nulle)', () => {
    for (let a = 0; a < box.length; a++) for (let b = a + 1; b < box.length; b++) {
      const A = box[a], B = box[b], oa = obb(A, t); let n = 0;
      for (let i = -A.w / 2 + 0.25; i < A.w / 2; i += 0.5) for (let j = -A.h / 2 + 0.25; j < A.h / 2; j += 0.5) for (const k of [-1.5, 0, 1.5]) {
        const w = oa.c.clone().addScaledVector(oa.ax[0], i).addScaledVector(oa.ax[1], j).addScaledVector(oa.ax[2], k);
        if (solidAt(A, w) && solidAt(B, w)) n++;
      }
      expect(n, `${A.name} / ${B.name}`).toBe(0);
    }
  });
  it('contient la caméra 2 et la carte de LED, sous le pan de chêne, sans entrer dans l\'habillage, et touche la façade à plat', () => {
    const oak = sc.planks.find((p) => p.name === 'Toit en chêne')!, lames = sc.planks.filter((p) => /^Lambris (avant|gauche)/.test(p.name));
    const cam = sc.planks.find((p) => p.special === 'camera' && /2/.test(p.name))!, ir = sc.planks.find((p) => p.name === 'LED infrarouges extérieures')!;
    const mn = new Vector3(1e9, 1e9, 1e9), mx = new Vector3(-1e9, -1e9, -1e9);
    for (const p of box) for (const c of corners(p, t)) { mn.min(c); mx.max(c); }
    for (const c of [...corners(cam, t), ...corners(ir, t)]) for (const k of ['x', 'y', 'z'] as const) { expect(c[k]).toBeGreaterThan(mn[k] - 0.01); expect(c[k]).toBeLessThan(mx[k] + 0.01); }
    for (const p of box) for (const c of corners(p, t)) {
      expect(belowOak(oak, c, t), p.name + ' sous le pan').toBeGreaterThanOrEqual(1.5);
      for (const l of lames) { const A = aabb(l, t); expect(c.x > A.min.x && c.x < A.max.x && c.y > A.min.y && c.y < A.max.y && c.z > A.min.z && c.z < A.max.z, `${p.name} dans ${l.name}`).toBe(false); }
    }
  });
  for (const [nom, over] of [['défaut', {}], ['trou-120', { hole: 120 }], ['intérieur-200', { l: 200, L: 200 }]] as const) {
    it(`(${nom}) contact de plan à plan avec la face extérieure du lambris avant (jeu ≤ 0,3 mm, sans pénétration) ; l'axe de l'objectif longe la façade`, () => {
      const s2 = buildNest(over), b2 = s2.planks.filter((p) => /^Boîte caméra 2/.test(p.name)), f2 = Math.min(...s2.planks.filter((l) => /^Lambris avant/.test(l.name)).map((l) => aabb(l, s2.t).min.y));
      const ys = b2.flatMap((p) => corners(p, s2.t).map((c) => c.y)), m2 = Math.max(...ys);
      expect(m2).toBeLessThanOrEqual(f2 + 1e-6); expect(m2).toBeGreaterThanOrEqual(f2 - 0.3);
      // le bord ouvert est un PLAN : les quatre plaques voisines y ont chacune au moins deux coins
      for (const p of b2.filter((q) => !/côté gauche/.test(q.name))) expect(corners(p, s2.t).filter((c) => c.y > f2 - 0.3).length, p.name).toBeGreaterThanOrEqual(2);
      const front = b2.find((p) => /face avant/.test(p.name))!, nrm = obb(front, s2.t).ax[2];
      expect(Math.abs(nrm.y), 'l\'objectif regarde le long de la façade').toBeLessThan(0.02);
      expect(Math.abs(nrm.z), 'et vers le bas ou à l\'horizontale, jamais au-delà de 35°').toBeLessThanOrEqual(Math.sin((35.5 * Math.PI) / 180));
    });
  }
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

describe('groupe « Couvercle » : pan de chêne + deux cadres de contreplaqué 3 mm collés dessous', () => {
  for (const [nom, over] of Object.entries(VARIANTS)) {
    it(`(${nom}) trois pièces, anneaux plats de 3 mm de 10 mm de large, vides au milieu, dans le caisson du toit, collés sous le chêne`, () => {
      const sc = buildNest(over), t = sc.t
      const oak = sc.planks.find((p) => p.name === 'Toit en chêne')!, rings = sc.planks.filter((p) => /^Cadre couvercle/.test(p.name));
      expect(rings.map((r) => r.name)).toEqual(['Cadre couvercle 1', 'Cadre couvercle 2']);
      expect(rings.every((r) => r.group === oak.group)).toBe(true);
      const front = sc.planks.find((p) => p.name === 'Face avant toit')!, side = sc.planks.find((p) => p.name === 'Côté gauche toit')!;
      for (const r of rings) {
        expect(r.material).toBeUndefined(); expect(r.special).toBeUndefined(); expect(r.depth).toBeUndefined(); expect(r.notches).toEqual([]);
        expect(r.rot).toEqual(oak.rot);
        expect(r.holes).toHaveLength(1); expect(r.holes[0]).toMatchObject({ shape: 'square', x: 0, y: 0 });
        expect((r.w - r.holes[0].size) / 2).toBeCloseTo(10, 6); expect((r.h - (r.holes[0].sh ?? 0)) / 2).toBeCloseTo(10, 6); // large de 10 mm
        expect(r.w).toBeCloseTo(front.w - 2 * t, 6); // extérieur = intérieur du caisson (jeu 0), mesuré en x
        const b = obb(r, t);
        for (const c of corners(r, t)) { expect(Math.abs(c.x)).toBeLessThanOrEqual(r.w / 2 + 1e-6); expect(Math.abs(c.y), 'dans le caisson').toBeLessThanOrEqual(side.w / 2 - t + 0.02); expect(belowOak(oak, c, t), 'sous le pan').toBeGreaterThanOrEqual(-0.02); }
        expect(b.h[2] * 2).toBe(t);
      }
      const bel = (r: Plank) => Math.min(...corners(r, t).map((c) => belowOak(oak, c, t)));
      expect(Math.min(...rings.map(bel))).toBeCloseTo(0, 1); expect(Math.max(...rings.map(bel))).toBeCloseTo(t, 1); // l'un contre le chêne, l'autre juste dessous
      const sheets = nestSheets(sc, 410, 400).filter((s) => s.material === undefined);
      for (const r of rings) expect(sheets.flatMap((s) => s.items.map((i) => i.plank.name)), r.name).toContain(r.name);
    });
  }
});
