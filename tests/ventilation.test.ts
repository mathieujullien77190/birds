import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { Plank, PlankScene } from '@/birdhouse/model';
import { HIDDEN_AT_CREATION } from '@/features/viewer/constants';
import { VARIANTS, buildNest } from './helpers';
import { aabb, gap, inside, obb, pathContacts, pathItems, ribbonPoints, thick } from './geomChecks';

const by = (sc: PlankScene, re: RegExp): Plank[] => sc.planks.filter((p) => re.test(p.name));
const one = (sc: PlankScene, re: RegExp): Plank => { const l = by(sc, re); expect(l, String(re)).toHaveLength(1); return l[0]; };
const union = (ps: Plank[], t: number) => { const bs = ps.map((p) => aabb(p, t)); return { min: new Vector3(Math.min(...bs.map((b) => b.min.x)), Math.min(...bs.map((b) => b.min.y)), Math.min(...bs.map((b) => b.min.z))), max: new Vector3(Math.max(...bs.map((b) => b.max.x)), Math.max(...bs.map((b) => b.max.y)), Math.max(...bs.map((b) => b.max.z))) }; };
const sc0 = buildNest({}), t = sc0.t;

describe('le Peltier est parti', () => {
  for (const [name, over] of Object.entries(VARIANTS)) {
    it(`aucune pièce de climatisation ni d'évacuation (${name})`, () => {
      const sc = buildNest(over);
      expect(by(sc, /Peltier|Dissipateur|Pont en H|Filtre LC|DS18B20|Plaque froide|Sonde température|Gouttière|Évacuation/i)).toEqual([]);
      expect(sc.planks.some((p) => (p.special as string) === 'alu' || (p.special as string) === 'peltier' || (p.special as string) === 'heatsink')).toBe(false);
      expect(Object.values(sc.groupNames ?? {})).not.toContain('Évacuation');
    });
  }
  it('le capteur BME280 et ses quatre fils sont toujours là, les deux Wago aussi', () => {
    for (const over of [{}, { solar: false }, { cam2: false }]) {
      const sc = buildNest(over);
      expect(by(sc, /^Capteur température/)).toHaveLength(1);
      expect(by(sc, /^Fil (3,3 V|SDA|SCL|masse) \(/).filter((p) => /^Fil (3,3 V \(rouge\)|SDA|SCL|masse \(noir\))/.test(p.name)).length).toBeGreaterThanOrEqual(4);
      expect(by(sc, /^Wago 221/)).toHaveLength(2);
    }
  });
});

describe('ventilateur : cassette amovible, siège, grille, sortie', () => {
  it('toutes les pièces existent', () => {
    const fan = one(sc0, /^Ventilateur Noctua NF-A6x25 PWM/);
    expect([fan.w, fan.h, fan.depth, fan.special]).toEqual([60, 60, 25, 'fan']);
    expect(by(sc0, /^Plot caoutchouc ventilateur/)).toHaveLength(4);
    expect(by(sc0, /^Goulotte ventilateur/)).toHaveLength(3);
    expect(by(sc0, /^Cassette ventilateur/).length).toBeGreaterThanOrEqual(6);
    one(sc0, /^Grille ventilateur/); one(sc0, /^Clapet de ventilation/); one(sc0, /^Grillage sortie ventilation/); one(sc0, /^Connecteur ventilateur \(4 broches\)/);
    one(sc0, /^Module interrupteur 12 V ventilateur \(côté \+, commande 3,3 V\)/);
    expect(by(sc0, /^Cale interrupteur/)).toHaveLength(4);
    const grille = one(sc0, /^Grille ventilateur/);
    expect(grille.holes.length).toBeGreaterThan(4);
    expect(grille.holes.every((h) => h.shape === 'round' && h.size === 6)).toBe(true);
  });
  it('le plafond du nid est percé sous le ventilateur, le dessus du toit est ouvert au-dessus (encoche)', () => {
    const fan = one(sc0, /^Ventilateur Noctua/), floor = one(sc0, /^Dessous toit/), top = one(sc0, /^Dessus toit/);
    const open = floor.holes.find((h) => h.shape === 'square' && h.size === 56);
    expect(open).toBeTruthy();
    expect(Math.abs(open!.x - fan.pos[0])).toBeLessThan(0.1);
    expect(top.notches.some((n) => n.edge === 'top' && n.width > 66)).toBe(true);
  });
  it('le siège, la cassette et le ventilateur restent dans le toit, loin de la batterie, à environ 1 cm de la gaine, à 4 mm au moins des cales du Pi', () => {
    const seat = union([...by(sc0, /^Goulotte ventilateur/), ...by(sc0, /^Cassette ventilateur/), one(sc0, /^Ventilateur Noctua/)], t);
    const W = 2 * (one(sc0, /^Face droite|^Côté droit toit/).pos[0] + t / 2), roofBack = one(sc0, /^Face arrière toit/), roofFloor = one(sc0, /^Dessous toit/);
    expect(seat.min.x).toBeGreaterThan(-W / 2); expect(seat.max.x).toBeLessThan(W / 2);
    expect(seat.max.y).toBeLessThanOrEqual(roofBack.pos[1] - t / 2 + 0.01); // contre la plaque arrière, jamais au travers
    expect(seat.min.z).toBeGreaterThanOrEqual(roofFloor.pos[2] - t / 2 - 0.01);
    const gaine = aabb(one(sc0, /^Gaine des fils/), t);
    const gaineBox = { min: new Vector3(55, 76, 0), max: new Vector3(71, 92, 400) }; // le chemin de la gaine est un fil : boîte du tube Ø 16 posée sur son axe
    void gaine;
    expect(gap(seat, gaineBox)).toBeGreaterThan(7);
    for (const p of by(sc0, /^Batterie LiFePO4|^Cale batterie/)) expect(gap(seat, aabb(p, t)), p.name).toBeGreaterThan(30);
    for (const p of by(sc0, /^Cale Pi /)) expect(gap(seat, aabb(p, t)), p.name).toBeGreaterThan(4);
    for (const p of by(sc0, /^Fusible/)) expect(gap(seat, aabb(p, t)), p.name).toBeGreaterThan(9);
  });
  it('aucun des fils du ventilateur ne traverse le siège, la cassette ou une nappe', () => {
    const fanNames = /ventilateur|cassette|interrupteur/i;
    const walls = [...by(sc0, /^Goulotte ventilateur/), ...by(sc0, /^Cassette ventilateur [1-4]$/), one(sc0, /^Cassette ventilateur cadre du bas/)].map((p) => obb(p, t));
    for (const p of sc0.planks.filter((q) => q.special === 'wire' && fanNames.test(q.name))) {
      for (const pt of pathItems([p])[0].pts) for (const w of walls) expect(inside(pt, w, -0.1), p.name).toBe(false);
    }
    const items = pathItems(sc0.planks);
    const bad = pathContacts(items).filter((c) => (fanNames.test(c.A) || fanNames.test(c.B)) && !c.shared && c.short > 0);
    expect(bad).toEqual([]);
    for (const n of sc0.planks.filter((q) => q.special === 'cable')) { const pts = ribbonPoints(n); for (const w of walls) expect(pts.some((v) => inside(v, w, 0.5)), n.name).toBe(false); }
  });
  it('les broches du Pi : 12 (PWM), 11 (tachymètre), 14 (masse), 13 (commande de l\'interrupteur) sont chacune utilisées une seule fois', () => {
    const names = ['Fil PWM ventilateur (bleu)', 'Fil tachymètre ventilateur (jaune)', 'Fil masse commune ventilateur (noir)', 'Fil commande interrupteur ventilateur (orange)'];
    const ends = names.map((n) => { const p = one(sc0, new RegExp('^' + n.replace(/[()]/g, '\\$&') + '$')); return p.path![p.path!.length - 1]; });
    for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) expect(new Vector3(...ends[i]).distanceTo(new Vector3(...ends[j]))).toBeGreaterThan(2);
    for (const q of sc0.planks.filter((x) => x.special === 'wire' && !names.includes(x.name) && x.path)) { const e = q.path![q.path!.length - 1]; for (const f of ends) if (Math.hypot(e[0] - f[0], e[1] - f[1]) < 1.5) throw new Error(`${q.name} arrive sur la même broche que ${f}`); }
    expect(by(sc0, /^Fil .*(ventilateur|cassette|interrupteur)/)).toHaveLength(12);
  });
  it('la sortie : fenêtre de la plaque arrière en face de celle de la cassette, jamais dans la zone du Pi ni de la batterie', () => {
    const back = one(sc0, /^Face arrière toit/), cass = one(sc0, /^Cassette ventilateur 2$/);
    const wins = back.holes.filter((h) => h.shape === 'square' && h.sh === 45);
    expect(wins.length).toBeGreaterThanOrEqual(2); // la sortie du ventilateur et la grande aération de l'électronique
    const winX = back.pos[0] + 0; void winX;
    const exit = wins.find((h) => Math.abs(h.x - (cass.pos[0] - back.pos[0])) < 0.1);
    expect(exit).toBeTruthy();
    const pi = one(sc0, /^Raspberry Pi/), bat = one(sc0, /^Batterie LiFePO4/);
    expect(exit!.x - exit!.size / 2).toBeGreaterThan(pi.pos[0] + 30); // à droite de la fenêtre des prises du Pi
    expect(Math.abs(exit!.x) - exit!.size / 2).toBeLessThan(bat.pos[0] + 64);
    const cassWin = cass.holes.find((h) => h.shape === 'square' && h.sh === 45);
    expect(cassWin).toBeTruthy();
    expect(Math.abs(cassWin!.size - exit!.size)).toBeLessThan(1);
    const exitWin = wins.filter((h) => h !== exit);
    for (const h of exitWin) expect(Math.abs(h.x - exit!.x) - (h.size + exit!.size) / 2).toBeGreaterThanOrEqual(0); // les deux fenêtres ne se recouvrent pas
    const flap = one(sc0, /^Clapet de ventilation/), net = one(sc0, /^Grillage sortie ventilation/);
    expect(flap.pos[1]).toBeGreaterThan(back.pos[1]); expect(net.pos[1]).toBeGreaterThan(back.pos[1]); // dehors, sous le débord du toit en chêne
    expect(Math.abs(flap.pos[0] - net.pos[0])).toBeLessThan(0.1);
  });
});

describe('bloc isolant d\'hiver', () => {
  it('même empreinte que la cassette, comble l\'ouverture du plafond, caché par défaut', () => {
    const cass = union(by(sc0, /^Cassette ventilateur [1-4]$|^Cassette ventilateur cadre/), t), win = union(by(sc0, /^Bloc isolant d'hiver/), t);
    for (const k of ['x', 'y'] as const) { expect(win.min[k]).toBeCloseTo(cass.min[k], 1); expect(win.max[k]).toBeCloseTo(cass.max[k], 1); }
    const foam = one(sc0, /^Isolant bloc d'hiver/), open = one(sc0, /^Dessous toit/).holes.find((h) => h.size === 56)!, ring = one(sc0, /^Bloc isolant d'hiver cadre du bas/);
    expect(foam.w).toBeGreaterThanOrEqual(open.size); expect(foam.depth).toBeGreaterThanOrEqual(30); expect(foam.depth).toBeLessThanOrEqual(40);
    expect(foam.pos[2] - foam.depth! / 2).toBeGreaterThanOrEqual(ring.pos[2] - t / 2 - 0.01); // posée sur le cadre
    const names = [...by(sc0, /^Bloc isolant d'hiver/), foam, one(sc0, /^Poignée bloc d'hiver/), one(sc0, /^Bouchon prise d'air/)].map((p) => p.name);
    for (const n of names) expect(HIDDEN_AT_CREATION.some((re) => re.test(n)), n).toBe(true);
    expect(HIDDEN_AT_CREATION.some((re) => re.test('Cassette ventilateur 1'))).toBe(false);
  });
});

describe("prise d'air basse", () => {
  const l = 120;
  it("le conduit est dans l'isolant du mur gauche, à l'avant, avec une section d'au moins 8 cm²", () => {
    const w = [1, 2, 3, 4].map((i) => one(sc0, new RegExp(`^Conduit d'air ${i}$`))), cover = one(sc0, /^Conduit d'air 5/);
    const x1 = w[0].pos[0], x2 = w[1].pos[0], y3 = w[2].pos[1], y4 = w[3].pos[1];
    const ix = Math.abs(x2 - x1) - t, iy = Math.abs(y4 - y3) - t; // intérieur libre : écart entre axes moins une épaisseur
    expect(ix * iy / 100).toBeGreaterThanOrEqual(8);
    const outer = one(sc0, /^Côté gauche ext/), inner = one(sc0, /^Côté gauche int/);
    expect(x1 - t / 2).toBeGreaterThan(outer.pos[0] + t / 2); expect(x2 + t / 2).toBeLessThan(inner.pos[0] - t / 2); // entre les deux parois
    expect(y3).toBeLessThan(0); // à l'avant (−y), le ventilateur est à l'arrière
    expect(cover.pos[2]).toBeGreaterThan(w[0].pos[2]);
    expect(by(sc0, /^Conduit d'air/)).toHaveLength(5);
  });
  it("la fente est à l'opposé du ventilateur : plus loin que la moitié de la largeur du nid", () => {
    const inner = one(sc0, /^Côté gauche int/), slot = inner.holes.find((h) => h.size === 36 && h.sh === 30)!;
    expect(slot).toBeTruthy();
    const sx = inner.pos[0], sy = inner.pos[1] + slot.x;
    const floor = one(sc0, /^Dessous toit/), open = floor.holes.find((h) => h.size === 56)!;
    expect(Math.hypot(sx - (floor.pos[0] + open.x), sy - (floor.pos[1] + open.y))).toBeGreaterThan(l / 2);
    expect(inner.pos[2] + slot.y).toBeGreaterThan(one(sc0, /^Plancher int/).pos[2]); // au-dessus du fond du nid
    expect(one(sc0, /^Clapet prise d'air/)); expect(one(sc0, /^Grillage fente prise d'air/)); expect(one(sc0, /^Grillage prise d'air$/)); expect(one(sc0, /^Auvent prise d'air/));
  });
  it("l'ouverture est dans « Dessous ext » (le fond intérieur n'a que le passage du conduit) et rien ne la bouche dessous", () => {
    const bottom = one(sc0, /^Dessous ext/), opening = bottom.holes.find((h) => h.shape === 'square' && Math.abs(h.x - one(sc0, /^Conduit d'air 5/).pos[0]) < 0.1)!;
    expect(opening).toBeTruthy();
    const box = { min: new Vector3(opening.x - opening.size / 2, bottom.pos[1] + opening.y - (opening.sh ?? 0) / 2, -400), max: new Vector3(opening.x + opening.size / 2, bottom.pos[1] + opening.y + (opening.sh ?? 0) / 2, 0) };
    const mine = /^(Auvent|Cale auvent|Grillage prise|Bouchon prise|Conduit d'air)/;
    for (const p of sc0.planks) { if (mine.test(p.name) || p.special === 'doc' || p.path) continue; const b = aabb(p, t); if (b.max.z > 0.01) continue; expect(gap(box, b), p.name).toBeGreaterThan(0.5); }
    const reg = aabb(one(sc0, /^Régulateur de charge/), t);
    expect(gap(box, reg)).toBeGreaterThan(20);
    expect(one(sc0, /^Plancher int/).holes.some((h) => h.size > 30 && h.sh! > 40)).toBe(true);
  });
  it("l'isolant est découpé autour du conduit", () => {
    const x = one(sc0, /^Conduit d'air 5/).pos, w = one(sc0, /^Conduit d'air 5/);
    const blocks = by(sc0, /^Isolant (gauche|sous le plancher)/);
    for (const b of blocks) { if (b.pos[2] - b.depth! / 2 >= w.pos[2] + t / 2 - 0.01) continue; const o = overlapXY(b, w); expect(o, b.name).toBeLessThan(1); } // (le pavé au-dessus du conduit est au-dessus de son couvercle)
    void x;
  });
});

/** Recouvrement en plan (surface) de deux pavés posés sans rotation. */
function overlapXY(a: Plank, b: Plank): number {
  const dx = Math.min(a.pos[0] + a.w / 2, b.pos[0] + b.w / 2) - Math.max(a.pos[0] - a.w / 2, b.pos[0] - b.w / 2), dy = Math.min(a.pos[1] + a.h / 2, b.pos[1] + b.h / 2) - Math.max(a.pos[1] - a.h / 2, b.pos[1] - b.h / 2);
  return dx > 0 && dy > 0 ? dx * dy : 0;
}
void thick;
