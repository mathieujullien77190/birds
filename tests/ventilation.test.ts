import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { Plank, PlankScene } from '@/birdhouse/model';
import { HIDDEN_AT_CREATION } from '@/features/viewer/constants';
import { VARIANTS, buildNest } from './helpers';
import { aabb, gap, inside, obb, pathContacts, pathItems, ribbonPoints, thick } from './geomChecks';

const by = (sc: PlankScene, re: RegExp): Plank[] => sc.planks.filter((p) => re.test(p.name));
const one = (sc: PlankScene, re: RegExp): Plank => { const l = by(sc, re); expect(l, String(re)).toHaveLength(1); return l[0]; };
const union = (ps: Plank[], t: number) => { const bs = ps.map((p) => aabb(p, t)); return { min: new Vector3(Math.min(...bs.map((b) => b.min.x)), Math.min(...bs.map((b) => b.min.y)), Math.min(...bs.map((b) => b.min.z))), max: new Vector3(Math.max(...bs.map((b) => b.max.x)), Math.max(...bs.map((b) => b.max.y)), Math.max(...bs.map((b) => b.max.z))) }; };
const sc0 = buildNest({}), t = sc0.t, GUARD_HALF = 1.5;

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
    one(sc0, /^Grillage inox maille 5 mm — sortie ventilation/); one(sc0, /^Plaque de connexion cassette/); one(sc0, /^Barrette 4 broches plaque de connexion/); one(sc0, /^Fiche 4 broches toit/);
    one(sc0, /^Module interrupteur 12 V ventilateur \(côté \+, commande 3,3 V\)/);
    expect(by(sc0, /^Cale interrupteur/)).toHaveLength(4);
    const guard = one(sc0, /^Grille de protection ventilateur 60 mm \(fil d'acier\)/);
    expect(guard.special).toBe('block'); expect(guard.holes).toEqual([]); // composant acheté, pas une plaque de contreplaqué percée
    expect(by(sc0, /^Grille ventilateur$/)).toEqual([]);
    const cass = union(by(sc0, /^Cassette ventilateur [1-4]$|^Cassette ventilateur cadre/), t), gb = aabb(guard, t); // la grille fait partie de la cassette
    expect(gb.min.x).toBeGreaterThanOrEqual(cass.min.x); expect(gb.max.x).toBeLessThanOrEqual(cass.max.x); expect(gb.min.y).toBeGreaterThanOrEqual(cass.min.y); expect(gb.max.y).toBeLessThanOrEqual(cass.max.y);
    const fan0 = one(sc0, /^Ventilateur Noctua/);
    expect(guard.pos[2] + GUARD_HALF).toBeLessThanOrEqual(fan0.pos[2] - fan0.depth! / 2 + 0.01); // sous le ventilateur (côté nid)
    expect(one(sc0, /^Grille de protection ventilateur/).group).toBe(one(sc0, /^Ventilateur Noctua/).group);
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
  it('aucun fil du ventilateur ne traverse le siège, la cassette ou une nappe (les quatre fils vers le Pi sont exemptés des croisements avec les nappes et les autres fils)', () => {
    const fanNames = /ventilateur|cassette|interrupteur/i, toPi = /^Fil (PWM ventilateur|tachymètre ventilateur|masse commune ventilateur|commande interrupteur ventilateur)/;
    const walls = [...by(sc0, /^Goulotte ventilateur/), ...by(sc0, /^Cassette ventilateur [1-4]$/), one(sc0, /^Cassette ventilateur cadre du bas/)].map((p) => obb(p, t));
    for (const p of sc0.planks.filter((q) => q.special === 'wire' && fanNames.test(q.name))) {
      for (const pt of pathItems([p])[0].pts) for (const w of walls) expect(inside(pt, w, -0.1), p.name).toBe(false);
    }
    const items = pathItems(sc0.planks);
    const bad = pathContacts(items).filter((c) => (fanNames.test(c.A) || fanNames.test(c.B)) && !toPi.test(c.A) && !toPi.test(c.B) && !c.shared && c.short > 0);
    expect(bad).toEqual([]);
    for (const n of sc0.planks.filter((q) => q.special === 'cable')) { const pts = ribbonPoints(n); for (const w of walls) expect(pts.some((v) => inside(v, w, 0.5)), n.name).toBe(false); }
  });
  it('les quatre fils vers le Pi restent sur le dessus du toit, sous la pente, sans traverser une pièce de bois ni un module', () => {
    const toPi = by(sc0, /^Fil (PWM ventilateur|tachymètre ventilateur|masse commune ventilateur|commande interrupteur ventilateur)/);
    expect(toPi).toHaveLength(4);
    const front = one(sc0, /^Face avant toit/), back = one(sc0, /^Face arrière toit/), top = one(sc0, /^Dessus toit/);
    const roofTop = top.pos[2] + t / 2, base = front.pos[2] - front.h / 2;
    const plane = (y: number) => base + front.h + ((y - front.pos[1]) * (back.h - front.h)) / (back.pos[1] - front.pos[1]);
    const solids = sc0.planks.filter((p) => !p.path && p.special !== 'doc' && p.special !== 'solar' && !/^(Dessus toit|Dessous toit|Face|Côté|Cadre|Isolant|Tasseau|Lambris|Toit en chêne|Grille de protection|Grille anti|Grillage|Clapet|Entrée|Fixation|Clavette|Barre)/.test(p.name) && !/^Bloc isolant d'hiver|^Isolant bloc|^Poignée bloc/.test(p.name) && !/^Dessous ext|^Plancher int|^Conduit d.air|^Auvent|^Cale auvent|^Bouchon/.test(p.name) && p.pos[2] > roofTop - 20 && p.pos[2] < roofTop + 120);
    for (const w of toPi) {
      const pts = pathItems([w])[0].pts, end = new Vector3(...w.path![w.path!.length - 1]), start = new Vector3(...w.path![0]);
      for (const pt of pts) {
        expect(pt.z, w.name).toBeGreaterThanOrEqual(roofTop - 0.01);
        expect(pt.z, w.name).toBeLessThanOrEqual(plane(pt.y) - 2 + 0.01);
        if (pt.distanceTo(end) < 14 || pt.distanceTo(start) < 8) continue; // les bouts entrent dans la broche du Pi et le module
        for (const s2 of solids) expect(inside(pt, obb(s2, t), -0.2), w.name + ' dans ' + s2.name).toBe(false);
      }
    }
  });
  it('plaque de connexion de la cassette : barrette et fiche alignées, dans le couvercle, loin de la poignée, sous la pente, avec une boucle de câble de 120 mm au moins', () => {
    const board = one(sc0, /^Plaque de connexion cassette/), head = one(sc0, /^Barrette 4 broches plaque de connexion/), plug = one(sc0, /^Fiche 4 broches toit/), lid = one(sc0, /^Cassette ventilateur couvercle/), handle = one(sc0, /^Poignée cassette/);
    expect(board.special).toBe('block'); // un composant acheté, pas du bois découpé
    expect(by(sc0, /^Entretoise plaque de connexion/)).toHaveLength(2); expect(by(sc0, /^Soudure plaque de connexion/)).toHaveLength(4);
    expect(Math.abs(plug.pos[1] - head.pos[1])).toBeLessThan(0.1); expect(Math.abs(plug.pos[2] - head.pos[2])).toBeLessThan(0.1); // même axe d'embrochage (horizontal)
    expect(plug.pos[0] - head.pos[0]).toBeGreaterThan(5); expect(plug.pos[0] - plug.w / 2).toBeGreaterThanOrEqual(head.pos[0] + head.w / 2 - 0.1); // emboîtée à la suite de la barrette
    const lidB = aabb(lid, t), bb = aabb(board, t);
    expect(bb.min.x).toBeGreaterThanOrEqual(lidB.min.x); expect(bb.max.x).toBeLessThanOrEqual(lidB.max.x); expect(bb.min.y).toBeGreaterThanOrEqual(lidB.min.y); expect(bb.max.y).toBeLessThanOrEqual(lidB.max.y);
    expect(gap(bb, aabb(handle, t))).toBeGreaterThan(1.5);
    const front = one(sc0, /^Face avant toit/), back = one(sc0, /^Face arrière toit/), base = front.pos[2] - front.h / 2;
    const plane = (y: number) => base + front.h + ((y - front.pos[1]) * (back.h - front.h)) / (back.pos[1] - front.pos[1]);
    const marge = plane(plug.pos[1]) - (plug.pos[2] + plug.depth! / 2);
    expect(marge).toBeGreaterThanOrEqual(2); expect(marge).toBeLessThan(15);
    expect(plane(handle.pos[1]) - (handle.pos[2] + handle.depth! / 2)).toBeGreaterThanOrEqual(2);
    const loops = ['Fil interrupteur → ventilateur + (rouge)', 'Fil ventilateur − (noir)', 'Fil PWM ventilateur (bleu)', 'Fil tachymètre ventilateur (jaune)', 'Fil masse commune ventilateur (noir)'].map((n) => one(sc0, new RegExp('^' + n.replace(/[()+−→]/g, '.') + '$')));
    for (const w of loops) {
      const pts = pathItems([w])[0].pts; let len = 0;
      for (let i2 = 1; i2 < pts.length; i2++) { const m = pts[i2]; if (Math.abs(m.x - lid.pos[0]) <= lid.w / 2 && Math.abs(m.y - lid.pos[1]) <= lid.h / 2 && m.z > lid.pos[2]) len += m.distanceTo(pts[i2 - 1]); }
      expect(len, w.name).toBeGreaterThanOrEqual(120);
    }
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
    expect(wins.length).toBeGreaterThanOrEqual(1); // la sortie du ventilateur (la grande aération de l'électronique a été supprimée : la fenêtre des prises du Pi suffit)
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
    const net = one(sc0, /^Grillage inox maille 5 mm — sortie ventilation/), joint = one(sc0, /^Joint cassette arrière/);
    expect(net.pos[1]).toBeGreaterThan(back.pos[1]); expect(net.pos[1]).toBeGreaterThan(joint.pos[1]); // dehors, sous le débord du toit en chêne ; plus extérieur que le joint de mousse
    expect(Math.abs(cass.pos[0] - net.pos[0])).toBeLessThan(0.1);
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

describe('sortie du ventilateur : rien ne dépasse derrière', () => {
  it('ni clapet ni joue de grillage ; le grillage est à plat contre la plaque, dans l épaisseur du lambris', () => {
    expect(by(sc0, /^Clapet de ventilation|^Joue grillage/)).toEqual([]);
    const back = one(sc0, /^Face arrière toit/), outer = back.pos[1] + t / 2, net = one(sc0, /^Grillage inox maille 5 mm — sortie ventilation/);
    expect(net.h).toBeCloseTo(0.8, 5); expect(net.pos[1] - net.h / 2 - outer).toBeGreaterThanOrEqual(-0.01); expect(net.pos[1] + net.h / 2 - outer).toBeLessThanOrEqual(1.5); // collé sur la face extérieure
    const lames = by(sc0, /^Lambris arrière/).filter((p) => p.poly);
    const inPoly = (pt: [number, number], poly: [number, number][]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
    const b = aabb(net, t);
    for (let x = b.min.x + 0.2; x <= b.max.x; x += 1) for (let z = b.min.z + 0.2; z <= b.max.z; z += 1) for (const l of lames) { const local: [number, number] = [x - l.pos[0], z - l.pos[2]]; expect(inPoly(local, l.poly!) && !l.holes.some((h) => Math.abs(local[0] - h.x) <= h.size / 2 && Math.abs(local[1] - h.y) <= (h.sh ?? h.size) / 2), 'grillage dans ' + l.name).toBe(false); }
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
    expect(one(sc0, /^Clapet prise d'air/)); expect(one(sc0, /^Grillage inox maille 5 mm — fente/)); expect(one(sc0, /^Grillage inox maille 5 mm — prise d'air$/)); expect(by(sc0, /^Auvent|^Cale auvent/)).toEqual([]);
  });
  it("l'ouverture est dans « Dessous ext » (le fond intérieur n'a que le passage du conduit) et rien ne la bouche dessous", () => {
    const bottom = one(sc0, /^Dessous ext/), opening = bottom.holes.find((h) => h.shape === 'square' && Math.abs(h.x - one(sc0, /^Conduit d'air 5/).pos[0]) < 0.1)!;
    expect(opening).toBeTruthy();
    const box = { min: new Vector3(opening.x - opening.size / 2, bottom.pos[1] + opening.y - (opening.sh ?? 0) / 2, -400), max: new Vector3(opening.x + opening.size / 2, bottom.pos[1] + opening.y + (opening.sh ?? 0) / 2, 0) };
    const mine = /^(Grillage inox maille 5 mm — prise|Bouchon prise|Conduit d'air)/;
    for (const p of sc0.planks) { if (mine.test(p.name) || p.special === 'doc' || p.path) continue; const b = aabb(p, t); if (b.max.z > 0.01) continue; expect(gap(box, b), p.name).toBeGreaterThan(0.5); }
    expect(aabb(one(sc0, /^Grillage inox maille 5 mm — prise d'air$/), t).min.z).toBeGreaterThanOrEqual(-0.85); // la seule pièce sous le fond, à plat
    expect(aabb(one(sc0, /^Bouchon prise d'air/), t).min.z).toBeGreaterThanOrEqual(-0.01); // le bouchon s'enfonce, sans saillie
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
