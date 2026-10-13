import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { nestSheets, OKOUME_COLOR, OKOUME_NATURAL, OKOUME_T, type Hole, type Plank } from '@/birdhouse/model';
import { VARIANTS, buildNest, withoutBagSlots } from './helpers';
import { obb, overlap } from './geomChecks';

/** Rectangle [x0, y0, x1, y1] d'un trou carré (repère de la plaque). */
const rect = (h: Hole): [number, number, number, number] => [h.x - h.size / 2, h.y - (h.sh ?? h.size) / 2, h.x + h.size / 2, h.y + (h.sh ?? h.size) / 2];
/** Écart entre deux rectangles (0 s'ils se touchent ou se recoupent). */
const rgap = (a: number[], b: number[]) => Math.hypot(Math.max(0, b[0] - a[2], a[0] - b[2]), Math.max(0, b[1] - a[3], a[1] - b[3]));

describe('toit en okoumé : deux plaques de 5 mm (crénelée dessous, pleine dessus) et quatre baguettes de 3 mm', () => {
  for (const [nom, over] of Object.entries(VARIANTS)) {
    describe(nom, () => {
      const sc = buildNest(over), t = sc.t;
      const A = sc.planks.find((p) => p.name === 'Toit en okoumé (plaque crénelée)')!, B = sc.planks.find((p) => p.name === 'Toit en okoumé (plaque pleine)')!;
      const bag = ['avant', 'arrière', 'gauche', 'droite'].map((c) => sc.planks.find((p) => p.name === `Baguette couvercle ${c}`)!);

      it('plaques en okoumé 5 mm NON peint, même emprise, la pleine posée à plat sur la crénelée, sans trou ni fente', () => {
        for (const p of [A, B]) { expect(p.material).toBe('okoume'); expect(p.depth).toBe(OKOUME_T); expect(p.color).toBe(OKOUME_NATURAL); expect(p.color).not.toBe(OKOUME_COLOR); expect(p.special).toBeUndefined(); }
        expect([B.w, B.h, B.rot]).toEqual([A.w, A.h, A.rot]);
        expect(B.holes).toEqual([]); expect(B.notches).toEqual([]);
        const n = obb(A, t).ax[2], d = new Vector3(...B.pos).sub(new Vector3(...A.pos));
        expect(d.dot(n)).toBeCloseTo(OKOUME_T, 1); // B est 5 mm plus haut que A, perpendiculairement au pan
        expect(d.clone().addScaledVector(n, -d.dot(n)).length()).toBeLessThan(0.05);
        expect(A.group).toBe(B.group);
        for (const b of bag) expect(b.group).toBe(A.group);
        expect(sc.planks.filter((p) => /^Cadre couvercle|^Toit en chêne/.test(p.name))).toEqual([]);
      });
      it('les deux plaques tiennent sur la planche d\'okoumé 410 × 400, les baguettes sur le contreplaqué', () => {
        expect(Math.min(A.w, A.h)).toBeLessThanOrEqual(400); expect(Math.max(A.w, A.h)).toBeLessThanOrEqual(410);
        const sheets = nestSheets(sc, 410, 400), names = (m: string | undefined) => sheets.filter((s) => s.material === m).flatMap((s) => s.items.map((i) => i.plank.name));
        expect(names('okoume')).toEqual(expect.arrayContaining([A.name, B.name]));
        for (const b of bag) { expect(b.material).toBeUndefined(); expect(names(undefined)).toContain(b.name); }
      });
      it('baguettes : corps de 10 mm et dents de 5 mm (affleurent le dessus de la plaque crénelée)', () => {
        for (const b of bag) {
          expect(b.h).toBe(15); expect(b.poly).toBeDefined();
          const ys = b.poly!.map((q) => q[1]), top = Math.max(...ys), bottom = Math.min(...ys), shoulder = [...new Set(ys)].sort((x, y) => x - y)[1];
          expect(top - bottom).toBeCloseTo(15, 5); expect(top - shoulder).toBeCloseTo(OKOUME_T, 5); expect(shoulder - bottom).toBeCloseTo(10, 5);
        }
      });
      it('chaque dent entre exactement dans une fente de la plaque crénelée (jeu 0) ; ligaments ≥ 3 mm entre fentes, avec le canal et avec les bords', () => {
        const nA = obb(A, t), slots = A.holes.filter((h) => h.r === undefined);
        const foot: number[][] = [];
        for (const b of bag) {
          const ob = obb(b, t), top = Math.max(...b.poly!.map((q) => q[1]));
          for (let i = 0; i < b.poly!.length; i++) { // dents = segments horizontaux du contour à y = top
            const p = b.poly![i], q = b.poly![(i + 1) % b.poly!.length];
            if (p[1] !== top || q[1] !== top || p[0] === q[0]) continue;
            const pts = [p[0], q[0]].flatMap((x) => [-1, 1].map((z) => ob.c.clone().addScaledVector(ob.ax[0], x).addScaledVector(ob.ax[1], top - 0.01).addScaledVector(ob.ax[2], z * t / 2)));
            const loc = pts.map((v) => { const d = v.clone().sub(nA.c); return [d.dot(nA.ax[0]), d.dot(nA.ax[1])]; });
            foot.push([Math.min(...loc.map((v) => v[0])), Math.min(...loc.map((v) => v[1])), Math.max(...loc.map((v) => v[0])), Math.max(...loc.map((v) => v[1]))]);
          }
        }
        expect(slots.length).toBe(foot.length);
        for (const f of foot) expect(slots.some((h) => rect(h).every((v, k) => Math.abs(v - f[k]) < 0.15)), JSON.stringify(f)).toBe(true);
        const rs = slots.map(rect), chan = A.holes.filter((h) => h.r !== undefined).map(rect);
        for (let i = 0; i < rs.length; i++) {
          for (let j = i + 1; j < rs.length; j++) expect(rgap(rs[i], rs[j])).toBeGreaterThanOrEqual(3 - 1e-6);
          for (const c of chan) expect(rgap(rs[i], c)).toBeGreaterThanOrEqual(3 - 1e-6);
          expect(Math.min(rs[i][0] + A.w / 2, A.w / 2 - rs[i][2], rs[i][1] + A.h / 2, A.h / 2 - rs[i][3])).toBeGreaterThanOrEqual(3);
        }
        // le haut des dents affleure le dessus de la plaque crénelée (donc le dessous de la pleine)
        for (const b of bag) { const ob = obb(b, t), top = Math.max(...b.poly!.map((q) => q[1])), p0 = ob.c.clone().addScaledVector(ob.ax[1], top); expect(p0.sub(nA.c).dot(nA.ax[2]) - A.depth! / 2).toBeCloseTo(0, 1); }
      });
      it('baguettes : jamais l\'une dans l\'autre (aire commune nulle), largeur = ouverture du caisson (jeu 0)', () => {
        const box = (b: Plank) => ({ ...obb(b, t), h: [b.w / 2 - 0.01, b.h / 2 - 0.01, t / 2 - 0.01] as [number, number, number] });
        for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) expect(overlap(box(bag[i]), box(bag[j])), `${bag[i].name} / ${bag[j].name}`).toBe(0);
        const W = Math.max(...sc.planks.filter((p) => /^Face avant ext/.test(p.name)).map((p) => p.w));
        for (const b of bag.slice(0, 2)) expect(b.w).toBeCloseTo(W - 2 * t, 1);
      });
      if (over.cam2 !== false) it('canal : un seul grand trou oblong dans la plaque crénelée, de l\'à-plomb de la caméra 2 jusque dans le caisson ; plus de fente dans la plaque avant ni de fenêtre dans le lambris', () => {
        const chan = A.holes.filter((h) => h.r !== undefined && (h.sh ?? 0) > 20); // le canal de la caméra 2 (celui du câble de la sonde fait 8 mm de large)
        expect(chan).toHaveLength(1);
        expect(chan[0].size).toBeGreaterThanOrEqual(24); expect(chan[0].size).toBeLessThanOrEqual(50);
        const cam = sc.planks.find((p) => p.name === 'Caméra 2')!, front = sc.planks.find((p) => p.name === 'Face avant toit')!;
        expect(withoutBagSlots(front.holes)).toHaveLength(0);
        expect(sc.planks.filter((p) => /^Lambris avant/.test(p.name) && p.holes.some((h) => h.shape === 'square' && Math.abs(h.size - 24) < 0.1 && Math.abs((h.sh ?? 0) - 12) < 0.1))).toEqual([]);
        const nA = obb(A, t), c = new Vector3(...cam.pos).sub(nA.c), camX = c.dot(nA.ax[0]), camY = c.dot(nA.ax[1]), [x0, y0, x1, y1] = rect(chan[0]);
        expect(camX).toBeGreaterThan(x0); expect(camX).toBeLessThan(x1); expect(camY).toBeGreaterThan(y0 - 12); // la carte est inclinée : son centre est un peu en avant du connecteur, sous lequel le canal commence
        expect(camY).toBeLessThan(y1);
        expect(y1).toBeGreaterThan(new Vector3(...bag[0].pos).sub(nA.c).dot(nA.ax[1]) + 3); // finit derrière la baguette avant (donc la plaque avant), dans le caisson
        expect(Math.min(x0 + A.w / 2, A.w / 2 - x1, y0 + A.h / 2, A.h / 2 - y1)).toBeGreaterThanOrEqual(3);
      });
    });
  }
});
