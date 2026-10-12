import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { THIN, nestSheets, outline, setAirPlug, setWinterCassette, type Plank, type PlankScene } from '@/birdhouse/model';
import { isThin, shapeMeasure } from '@/birdhouse/model/nest/spares';
import { partTable, plankCodes } from '@/birdhouse/model/sheets/partCodes';
import { HIDDEN_AT_CREATION } from '@/features/viewer/constants';
import { VARIANTS, buildNest, buildNestFull } from './helpers';
import { aabb, obb } from './geomChecks';
import { ligament } from './geomLigament';

const by = (sc: PlankScene, re: RegExp): Plank[] => sc.planks.filter((p) => re.test(p.name));
const one = (sc: PlankScene, re: RegExp): Plank => { const l = by(sc, re); expect(l, String(re)).toHaveLength(1); return l[0]; };
const world = (p: Plank, t: number, lx: number, ly: number): Vector3 => { const b = obb(p, t); return b.c.clone().addScaledVector(b.ax[0], lx).addScaledVector(b.ax[1], ly); };
const local = (p: Plank, t: number, v: Vector3): [number, number] => { const b = obb(p, t), d = v.clone().sub(b.c); return [d.dot(b.ax[0]), d.dot(b.ax[1])]; };
const apart = (a: { min: Vector3; max: Vector3 }, b: { min: Vector3; max: Vector3 }, withZ = true): boolean =>
  a.max.x <= b.min.x + 1e-6 || b.max.x <= a.min.x + 1e-6 || a.max.y <= b.min.y + 1e-6 || b.max.y <= a.min.y + 1e-6 || (withZ && (a.max.z <= b.min.z + 1e-6 || b.max.z <= a.min.z + 1e-6));

describe('baguettes qui portent le dessus du toit (contreplaqué 3 mm, dents dans les plaques du toit)', () => {
  for (const [name, over] of Object.entries(VARIANTS)) {
    const sc = buildNest(over), t = sc.t;
    const bag = by(sc, /^Baguette dessus toit/);
    it(`plus de tasseaux de bois : cinq baguettes plates découpées au laser, 3 mm, dents impaires, bouts sans dent (${name})`, () => {
      expect(by(sc, /^Tasseau (gauche|droite|avant|arrière)/)).toEqual([]);
      expect(bag.map((p) => p.name).sort()).toEqual(['Baguette dessus toit arrière 1', 'Baguette dessus toit arrière 2', 'Baguette dessus toit avant', 'Baguette dessus toit droite', 'Baguette dessus toit gauche']);
      for (const p of bag) {
        expect(p.special, p.name).toBeUndefined(); expect(p.material, p.name).toBeUndefined();
        expect(p.h, p.name).toBeCloseTo(5 + t, 5); // 5 mm de corps (appui) + dents de t
        expect(p.cast!.top!.n % 2, p.name).toBe(1); expect(p.cast!.top!.n, p.name).toBeGreaterThanOrEqual(3); expect(p.cast!.top!.phase).toBe(0); // bouts = corps
        expect(p.group).toBe(one(sc, /^Face avant toit$/).group);
      }
    });
    it(`le dessus des baguettes affleure le dessous de « Dessus toit » (plan de repos inchangé) (${name})`, () => {
      const top = one(sc, /^Dessus toit/);
      for (const p of bag) expect(p.pos[2] + t / 2, p.name).toBeCloseTo(top.pos[2] - t / 2, 5);
    });
    it(`chaque dent entre dans une fente de la plaque porteuse (et chaque fente a sa dent), ligaments ≥ 4,5 mm (${name})`, () => {
      const carriers: [RegExp, RegExp][] = [[/^Côté gauche toit/, /gauche$/], [/^Côté droit toit/, /droite$/], [/^Face avant toit$/, /avant$/], [/^Face arrière toit$/, /arrière \d$/]];
      for (const [cre, bre] of carriers) {
        const car = one(sc, cre), mine = bag.filter((p) => bre.test(p.name));
        const plate = sc.planks.find((p) => /^Plaque caméra extérieure$/.test(p.name)); // ses fentes (dents de la plaque de la caméra extérieure) ne sont pas celles des baguettes
        const slots = car.holes.filter((h) => Math.min(h.size, h.sh ?? h.size) <= 3.01 && Math.max(h.size, h.sh ?? h.size) > 8 && Math.max(h.size, h.sh ?? h.size) < 40 && !(plate && Math.abs(car.pos[2] + h.y - plate.pos[2]) < 2 && /^Face avant toit$/.test(car.name)));
        let teeth = 0;
        const used = new Set<string>();
        for (const p of mine) {
          const o = outline(p);
          for (let i = 0; i < o.length; i++) {
            const a = o[i], b = o[(i + 1) % o.length];
            if (Math.abs(a[1] - p.h / 2) > 1e-6 || Math.abs(b[1] - p.h / 2) > 1e-6 || Math.abs(a[0] - b[0]) < 1) continue; // le bout d'une dent (bord haut)
            teeth++;
            const [cx, cy] = local(car, t, world(p, t, (a[0] + b[0]) / 2, p.h / 2 - t / 2));
            const s = slots.find((h) => Math.abs(cx - h.x) <= h.size / 2 + 1e-6 && Math.abs(cy - h.y) <= (h.sh ?? h.size) / 2 + 1e-6);
            expect(s, `${p.name} : dent dans une fente de ${car.name}`).toBeTruthy(); used.add(s!.id);
            expect(Math.abs(Math.abs(a[0] - b[0]) - Math.max(s!.size, s!.sh!))).toBeLessThan(0.5); // fente = dent
          }
        }
        expect(teeth, car.name).toBeGreaterThan(0); expect(used.size, car.name + ' : une fente par dent').toBe(slots.length);
        for (const h of slots) expect(ligament(car, h).min, `${car.name} ligament`).toBeGreaterThanOrEqual(4.5 - 1e-6);
      }
    });
    it(`aucun recouvrement des baguettes avec les autres pièces (hors plaques porteuses, où seules les dents entrent) (${name})`, () => {
      const carrier = /^(Côté gauche toit|Côté droit toit|Face avant toit|Face arrière toit)/;
      for (const p of bag) for (const q of sc.planks) {
        if (q === p || q.path || q.special === 'doc' || q.special === 'solar' || carrier.test(q.name) || /^Baguette dessus toit/.test(q.name) || /^Baguette de cale/.test(q.name) || /^Isolant/.test(q.name)) continue; // la laine d'isolant n'est pas une pièce solide
        expect(apart(aabb(p, t), aabb(q, t)), `${p.name} / ${q.name}`).toBe(true);
      }
    });
  }
  it('elles se rangent sur les planches de contreplaqué ; la baguette droite est raccourcie autour du fourreau de la gaine (donc plus identique à la gauche)', () => {
    const sc = buildNest({}), codes = plankCodes(sc);
    const items = nestSheets(sc, 410, 400).flatMap((s) => s.items.filter((i) => /^Baguette dessus toit/.test(i.plank.name)));
    expect(items).toHaveLength(5);
    expect(codes.get(one(sc, /^Baguette dessus toit gauche$/).id)).not.toBe(codes.get(one(sc, /^Baguette dessus toit droite$/).id));
    expect(one(sc, /^Baguette dessus toit droite$/).w).toBeLessThan(one(sc, /^Baguette dessus toit gauche$/).w);
  });
});

describe('pièces fines de rechange', () => {
  const sc = buildNestFull({}), t = sc.t, base = buildNest({});
  const spares = sc.planks.filter((p) => p.spareOf);
  const thin = base.planks.filter(isThin);
  it(`seuil nommé : plus petit côté ou largeur moyenne ≤ ${THIN.maxWidth} mm ; ${THIN.copies} exemplaires par pièce fine, jamais d'un composant ni des baguettes de cale`, () => {
    expect(THIN.maxWidth).toBe(12); expect(THIN.copies).toBe(3);
    expect(thin.length).toBeGreaterThanOrEqual(25);
    expect(spares).toHaveLength(thin.length * THIN.copies);
    for (const p of thin) { expect(p.special).toBeUndefined(); expect(p.name).not.toMatch(/^Baguette de cale/); const m = shapeMeasure(p); expect(Math.min(m.w, m.h) <= 12 || m.mean <= 12, p.name).toBe(true); }
    expect(base.planks.filter((p) => !isThin(p) && !p.special && !/^Baguette de cale/.test(p.name)).every((p) => { const m = shapeMeasure(p); return Math.min(m.w, m.h) > 12 && m.mean > 12; })).toBe(true);
    for (const n of ['Poignée cassette 1', 'Conduit de sortie 3', 'Étrier régulateur 1', 'Clavette fixation 1.1', 'Baguette couvercle avant', 'Baguette dessus toit gauche']) expect(thin.some((p) => p.name === n), n).toBe(true);
    expect(sc.planks.filter((p) => /^Baguette de cale \d+ \(rechange/.test(p.name))).toEqual([]);
  });
  it("noms uniques « … (rechange k) », groupe « Pièces fines de rechange » visible, identiques à l'original (contour, trous, dents, matériau)", () => {
    const names = spares.map((p) => p.name); expect(new Set(names).size).toBe(names.length); for (const n of names) expect(base.planks.some((p) => p.name === n)).toBe(false);
    const g = Object.entries(sc.groupNames!).find(([, n]) => n === 'Pièces fines de rechange')![0];
    const strip = (q: Plank) => JSON.stringify({ m: q.material, d: q.depth, w: q.w, h: q.h, poly: q.poly, holes: q.holes.map((h) => ({ ...h, id: 0 })), notches: q.notches.map((n) => ({ ...n, id: 0 })), c: q.color });
    for (const p of spares) {
      const o = sc.planks.find((q) => q.id === p.spareOf)!;
      expect(p.name).toMatch(/ \(rechange [123]\)$/); expect(p.name.replace(/ \(rechange \d\)$/, '')).toBe(o.name);
      expect(p.group).toBe(g); expect(p.special).toBeUndefined();
      expect(strip(p), p.name).toBe(strip(o)); expect(p.rot).toEqual([0, 0, 0]);
    }
    expect(HIDDEN_AT_CREATION.some((re) => spares.some((p) => re.test(p.name)))).toBe(false);
  });
  it("même numéro que l'original (plankSignature) ; la table « Plaques à découper » compte les rechanges dans la quantité", () => {
    const codes = plankCodes(sc);
    for (const p of spares) expect(codes.get(p.id), p.name).toBe(codes.get(p.spareOf!));
    const row = partTable(sc).find((r) => r.code === codes.get(one(sc, /^Poignée cassette 1$/).id))!;
    expect(row.qty).toBeGreaterThanOrEqual(1 + 3); expect(row.names.some((n) => /rechange/.test(n))).toBe(false);
  });
  it("à plat sur le sol, à l'écart du nichoir, des pièces d'hiver et des baguettes de cale, sans recouvrement entre elles", () => {
    const others = sc.planks.filter((p) => !p.spareOf && !p.path && p.special !== 'doc' && p.special !== 'solar');
    for (const p of spares) { const b = aabb(p, t); expect(b.min.z, p.name).toBeCloseTo(0, 5); expect(b.max.z - b.min.z).toBeCloseTo(p.material ? p.depth! : t, 5); }
    for (let i = 0; i < spares.length; i++) {
      const a = aabb(spares[i], t);
      for (const q of others) expect(apart(a, aabb(q, t)), `${spares[i].name} / ${q.name}`).toBe(true);
      for (let j = i + 1; j < spares.length; j++) expect(apart(a, aabb(spares[j], t), false), `${spares[i].name} / ${spares[j].name}`).toBe(true);
    }
  });
  it("les boutons cassette / prise d'air ne déplacent pas les rechanges", () => {
    const w = setAirPlug(setWinterCassette(sc, true), true);
    for (const p of spares) expect(w.planks.find((q) => q.id === p.id)!.pos).toEqual(p.pos);
  });
  it('découpées au laser : toutes rangées sur les planches, sans planche de plus', () => {
    const withS = nestSheets(sc, 410, 400), without = nestSheets(base, 410, 400), codes = plankCodes(sc);
    expect(withS.flatMap((s) => s.items).filter((i) => i.plank.spareOf)).toHaveLength(spares.length);
    expect(withS.length).toBeLessThanOrEqual(without.length);
    for (const s of withS) for (const it of s.items) if (it.plank.spareOf) expect(it.code).toBe(codes.get(it.plank.spareOf));
  });
});
