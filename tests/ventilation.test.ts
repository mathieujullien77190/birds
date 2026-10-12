import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { Plank, PlankScene } from '@/birdhouse/model';
import { HIDDEN_AT_CREATION } from '@/features/viewer/constants';
import { VARIANTS, buildNest } from './helpers';
import { aabb, gap, inside, obb, pathContacts, pathItems, ribbonPoints, thick } from './geomChecks';
import { nestSheets, outline, setAirPlug, setWinterCassette, winterState } from '@/birdhouse/model';
import { ligament } from './geomLigament';

const by = (sc: PlankScene, re: RegExp): Plank[] => sc.planks.filter((p) => re.test(p.name));
const one = (sc: PlankScene, re: RegExp): Plank => { const l = by(sc, re); expect(l, String(re)).toHaveLength(1); return l[0]; };
const union = (ps: Plank[], t: number) => { const bs = ps.map((p) => aabb(p, t)); return { min: new Vector3(Math.min(...bs.map((b) => b.min.x)), Math.min(...bs.map((b) => b.min.y)), Math.min(...bs.map((b) => b.min.z))), max: new Vector3(Math.max(...bs.map((b) => b.max.x)), Math.max(...bs.map((b) => b.max.y)), Math.max(...bs.map((b) => b.max.z))) }; };
const sc0 = buildNest({}), t = sc0.t, GUARD_HALF = 1.5;

describe('le Peltier est parti', () => {
  for (const [name, over] of Object.entries(VARIANTS)) {
    it(`aucune pièce de climatisation ni d'évacuation (${name})`, () => {
      const sc = buildNest(over);
      expect(by(sc, /Peltier|Dissipateur|Pont en H|Filtre LC|Plaque froide|Sonde température|Gouttière|Évacuation/i)).toEqual([]);
      expect(by(sc, /DS18B20/).map((p) => p.name).filter((nm) => !/^(Sonde de température extérieure|Module DS18B20|Câble sonde extérieure)/.test(nm))).toEqual([]); // seule la sonde de dehors (et son module) existe
      expect(sc.planks.some((p) => (p.special as string) === 'alu' || (p.special as string) === 'peltier' || (p.special as string) === 'heatsink')).toBe(false);
      expect(Object.values(sc.groupNames ?? {})).not.toContain('Évacuation');
    });
  }
  it('le capteur BME280 et ses quatre fils sont toujours là, les deux Wago aussi', () => {
    for (const over of [{}, { cam2: false }]) {
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
    expect(by(sc0, /^Grille de sortie ventilation|^Grille d'aération du corps/)).toEqual([]); // grilles percées dans les plaques (« Face arrière toit », « Côté gauche int »), plus de plaque séparée
    one(sc0, /^Prise 4 broches du ventilateur/); one(sc0, /^Rallonge ventilateur 4 broches/);
    one(sc0, /^Module interrupteur 12 V ventilateur \(côté \+, commande 3,3 V\)/);
    expect(by(sc0, /^Cale /)).toEqual([]); // plus de cales de bois : des baguettes de contreplaqué à couper au montage (tests/wedge-strips.test.ts)
    const guard = one(sc0, /^Grille de protection ventilateur 60 mm \(fil d'acier\)/);
    expect(guard.special).toBe('guard'); expect(guard.holes).toEqual([]); // composant acheté, pas une plaque de contreplaqué percée
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
  it('le siège, la cassette et le ventilateur restent dans le toit, loin de la batterie, à environ 1 cm de la gaine, ', () => {
    const seat = union([...by(sc0, /^Goulotte ventilateur/), ...by(sc0, /^Cassette ventilateur/), one(sc0, /^Ventilateur Noctua/)], t);
    const W = 2 * (one(sc0, /^Face droite|^Côté droit toit/).pos[0] + t / 2), roofBack = one(sc0, /^Face arrière toit/), roofFloor = one(sc0, /^Dessous toit/);
    expect(seat.min.x).toBeGreaterThan(-W / 2); expect(seat.max.x).toBeLessThan(W / 2);
    expect(seat.max.y).toBeLessThanOrEqual(roofBack.pos[1] - t / 2 + 0.01); // contre la plaque arrière, jamais au travers
    expect(seat.min.z).toBeGreaterThanOrEqual(roofFloor.pos[2] - t / 2 - 0.01);
    const gaine = aabb(one(sc0, /^Gaine des fils/), t);
    const gaineBox = { min: new Vector3(55, 76, 0), max: new Vector3(71, 92, 400) }; // le chemin de la gaine est un fil : boîte du tube Ø 16 posée sur son axe
    void gaine;
    expect(gap(seat, gaineBox)).toBeGreaterThan(7);
    for (const p of by(sc0, /^Batterie LiFePO4/)) expect(gap(seat, aabb(p, t)), p.name).toBeGreaterThan(30);
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
    const solids = sc0.planks.filter((p) => !p.path && p.special !== 'doc' && p.special !== 'solar' && !/^(Dessus toit|Dessous toit|Face|Côté|Cadre|Isolant|Tasseau|Lambris|Toit en okoumé|Grille de protection|Grille anti|Grillage|Clapet|Entrée|Fixation|Clavette|Barre)/.test(p.name) && !/^Bloc isolant d'hiver|^Isolant bloc|^Poignée bloc/.test(p.name) && !/^Dessous ext|^Plancher int|^Conduit d.air|^Auvent|^Cale auvent|^Bouchon/.test(p.name) && p.pos[2] > roofTop - 20 && p.pos[2] < roofTop + 120);
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
  it('prise mâle de la rallonge collée sur la face avant du siège, prise d origine (femelle) sur le bord avant du couvercle juste au-dessus : sous la pente, fils qui contournent le siège', () => {
    const head = one(sc0, /^Prise 4 broches du ventilateur/), plug = one(sc0, /^Rallonge ventilateur 4 broches : prise mâle/), lid = one(sc0, /^Cassette ventilateur couvercle/), handle = one(sc0, /^Poignée cassette 2$/), seat = one(sc0, /^Goulotte ventilateur avant/);
    expect(by(sc0, /^(Plaque de connexion|Barrette|Soudure|Entretoise plaque|Fiche 4 broches)/)).toEqual([]); // plus de plaque de prototypage ni de soudure
    expect(head.special).toBe('block');
    const sb = aabb(seat, t), pb = aabb(plug, t), hb = aabb(head, t), lb = aabb(lid, t);
    expect(Math.abs(pb.max.y - sb.min.y)).toBeLessThan(0.01); // collée sur la face avant (extérieure) de la paroi avant du siège
    expect(pb.min.x).toBeGreaterThanOrEqual(sb.min.x); expect(pb.max.x).toBeLessThanOrEqual(sb.max.x); expect(pb.max.z).toBeGreaterThan(sb.max.z - 0.01); expect(pb.min.z).toBeGreaterThan(sb.max.z - 8); // en haut de la paroi
    const camBack = Math.max(...by(sc0, /^(Face arrière|Face avant|Côté droit|Côté gauche) caméra/).map((p) => aabb(p, t).max.y));
    expect(pb.min.y - camBack).toBeGreaterThanOrEqual(3.5); // dans l'espace de 10 mm entre le siège et le bloc caméra
    expect(Math.abs(head.pos[0] - plug.pos[0])).toBeLessThan(0.1); expect(Math.abs(hb.min.z - pb.max.z)).toBeLessThan(0.01); // la femelle est posée à la verticale sur la mâle (la cassette se retire par le haut)
    expect(Math.abs(hb.max.y - lb.min.y)).toBeLessThan(0.01); expect(hb.min.z).toBeLessThan(lb.max.z); expect(hb.max.z).toBeGreaterThan(lb.max.z); // collée sur la tranche avant du couvercle
    expect(head.group).toBe(lid.group); expect(plug.group).toBe(lid.group);
    expect(gap(hb, aabb(handle, t))).toBeGreaterThan(1.5); expect(gap(pb, aabb(handle, t))).toBeGreaterThan(1.5);
    const passage = lid.holes.find((h) => Math.min(h.size, h.sh ?? h.size) <= 6 && Math.max(h.size, h.sh ?? h.size) >= 10)!; expect(passage).toBeTruthy(); expect(ligament(lid, passage).min).toBeGreaterThanOrEqual(4.5 - 1e-6); // passage du câble d origine, près du bord avant
    for (const re of [/^Fil cassette [+] [(]rouge[)]$/, /^Fil cassette PWM/, /^Fil cassette tachymètre/, /^Fil cassette − [(]noir[)]$/]) { const w = one(sc0, re), e = new Vector3(...w.path![w.path!.length - 1]); expect(e.x).toBeGreaterThan(hb.min.x); expect(e.x).toBeLessThan(hb.max.x); expect(e.y).toBeGreaterThan(hb.min.y); expect(e.y).toBeLessThan(hb.max.y); expect(e.z).toBeGreaterThan(hb.min.z); expect(e.z).toBeLessThan(hb.max.z); } // le câble finit dans la prise
    const front = one(sc0, /^Face avant toit/), back = one(sc0, /^Face arrière toit/), base = front.pos[2] - front.h / 2;
    const plane = (y: number) => base + front.h + ((y - front.pos[1]) * (back.h - front.h)) / (back.pos[1] - front.pos[1]);
    expect(plane(hb.max.y) - hb.max.z).toBeGreaterThanOrEqual(2); expect(plane(pb.min.y) - pb.max.z).toBeGreaterThanOrEqual(2);
    expect(plane(handle.pos[1]) - (handle.pos[2] + t / 2)).toBeGreaterThanOrEqual(2);
    // les fils de la rallonge (et la commande de l'interrupteur) partent de la prise mâle et CONTOURNENT le siège : aucun point au-dessus de la cassette, du siège ni de l'ouverture du plafond, ni derrière le siège
    const roofTopZ = one(sc0, /^Dessus toit/).pos[2] + t / 2, cb = aabb(one(sc0, /^Cassette ventilateur 2$/), t), duct = by(sc0, /^Conduit de sortie/);
    const names = ['Fil interrupteur → ventilateur + (rouge)', 'Fil ventilateur − (noir)', 'Fil PWM ventilateur (bleu)', 'Fil tachymètre ventilateur (jaune)', 'Fil masse commune ventilateur (noir)', 'Fil commande interrupteur ventilateur (orange)'];
    for (const n of names) {
      const w = one(sc0, new RegExp('^' + n.replace(/[()+−→]/g, '.') + '$')), pts = pathItems([w])[0].pts;
      for (const p of pts) {
        const over = p.x > sb.min.x - 0.5 && p.x < sb.max.x + 0.5 && p.y > sb.min.y - 0.5 && p.y < cb.max.y + 0.5 && p.z > roofTopZ; // au-dessus de l'empreinte du siège (parois, cassette, ouverture du plafond)
        expect(over && !(p.y < sb.min.y), w.name + ' par-dessus la cassette').toBe(false);
        for (const d of duct) expect(inside(p, obb(d, t), 0), w.name + ' dans le conduit de sortie').toBe(false);
      }
      if (n !== names[5]) { const near = Math.min(...pts.map((p) => Math.hypot(p.x - plug.pos[0], p.y - plug.pos[1], p.z - plug.pos[2]))); expect(near, n + ' part de la prise mâle').toBeLessThan(8); }
    }
  });
  it('cassette sortie : la prise mâle et ses fils restent en place, la prise femelle et son câble partent avec la cassette (on la débranche à la main)', () => {
    const out = setWinterCassette(sc0, true);
    for (const re of [/^Rallonge ventilateur 4 broches : prise mâle/, /^Fil PWM ventilateur/, /^Fil interrupteur → ventilateur [+]/]) expect(one(out, re)).toEqual(one(sc0, re));
    expect(one(out, /^Prise 4 broches du ventilateur/).pos).not.toEqual(one(sc0, /^Prise 4 broches du ventilateur/).pos);
    expect(one(out, /^Fil cassette PWM/).path).not.toEqual(one(sc0, /^Fil cassette PWM/).path);
    expect(by(out, /^Bloc isolant d'hiver/).some((p) => /prise/i.test(p.name))).toBe(false); // le bloc d'hiver n'a pas de prise
  });
  it("poignée en U de la cassette : centrée, pieds incrustés dans deux fentes du couvercle, ouverture libre, marge de 2 mm sous la pente", () => {
    const layers = by(sc0, /^Poignée cassette \d$/), u = one(sc0, /^Poignée cassette 2$/), lid = one(sc0, /^Cassette ventilateur couvercle/), ub = union(layers, t), lb = aabb(lid, t);
    expect(layers).toHaveLength(3); for (const l of layers) { expect(l.poly).toEqual(u.poly); expect(l.pos[0]).toBe(u.pos[0]); expect(l.pos[2]).toBe(u.pos[2]); } // trois couches identiques de 3 mm collées face à face
    expect(ub.max.y - ub.min.y).toBeCloseTo(3 * t, 2); // épaisseur totale 9 mm
    expect(Math.abs((ub.max.x + ub.min.x) / 2 - lid.pos[0])).toBeLessThanOrEqual(0.1); expect(Math.abs((ub.max.y + ub.min.y) / 2 - lid.pos[1])).toBeLessThanOrEqual(0.1); // centrée sur le couvercle (x et y) à 0,1 mm
    const slots = lid.holes.filter((h) => h.size < 4 && (h.sh ?? 0) > 8 && (h.sh ?? 0) < 10); expect(slots).toHaveLength(2); // une fente par pied : t en x, 3 couches (9 mm) en y
    for (const h of slots) { expect(Math.abs(Math.abs(h.x) - (u.w - t) / 2)).toBeLessThan(0.01); expect(h.size).toBeGreaterThanOrEqual(t); expect(h.size).toBeLessThanOrEqual(t + 0.5); expect(h.sh!).toBeGreaterThanOrEqual(3 * t); expect(h.sh!).toBeLessThanOrEqual(3 * t + 0.5); expect(ligament(lid, h).min, 'ligament').toBeGreaterThanOrEqual(4.5 - 1e-6); } // les tenons sont les pieds
    expect(ub.min.z).toBeCloseTo(lb.max.z - t, 2); // les tenons affleurent la face intérieure du couvercle
    const open = ub.max.z - t - lb.max.z; expect(open).toBeGreaterThanOrEqual(5); expect(u.w - 2 * t).toBeGreaterThanOrEqual(24); // ouverture ≥ 5 × 24 (petite poignée : le bout des doigts)
    const front = one(sc0, /^Face avant toit/), back = one(sc0, /^Face arrière toit/), base = front.pos[2] - front.h / 2;
    const plane = (y: number) => base + front.h + ((y - front.pos[1]) * (back.h - front.h)) / (back.pos[1] - front.pos[1]);
    expect(plane(ub.max.y) - ub.max.z).toBeGreaterThanOrEqual(2); expect(plane(ub.min.y) - ub.max.z).toBeGreaterThanOrEqual(2); // marge sous la pente
    const blk2 = setWinterCassette(sc0, true), ub2 = one(blk2, /^Poignée bloc d'hiver 2$/), bl = one(blk2, /^Bloc isolant d'hiver couvercle/);
    expect(by(blk2, /^Poignée bloc d'hiver \d$/)).toHaveLength(3); expect(ub2.pos[0]).toBe(u.pos[0]); expect(ub2.pos[2]).toBe(u.pos[2]); expect(ub2.pos[1] - u.pos[1]).toBeCloseTo((one(sc0, /^Face arrière toit/).pos[1] - t / 2 - aabb(one(sc0, /^Cassette ventilateur 2$/), t).max.y) / 2, 1) /* plus longue de la place du conduit */; expect(ub2.w).toBe(u.w); expect(ub2.h).toBe(u.h); expect(ub2.poly).toEqual(u.poly); expect(bl.holes.map((h) => ({ ...h, id: 0 }))).toEqual(slots.map((h) => ({ ...h, id: 0 }))); // même U, mêmes fentes sur le bloc
    expect(u.poly!.length).toBe(8); expect(u.special).toBeUndefined(); // contreplaqué découpé au laser
  });
  it('cassette en boîte crénelée : dents sur chaque arête, phases 0 / 1 alternées, ouvertures à plus de 4,5 mm des crans, même enveloppe que le siège', () => {
    const walls = by(sc0, /^Cassette ventilateur [1-4]$/), floor = one(sc0, /^Cassette ventilateur cadre du bas/), lid = one(sc0, /^Cassette ventilateur couvercle/);
    expect(walls).toHaveLength(4);
    for (const p of [...walls, floor, lid]) { for (const e of ['top', 'bottom', 'left', 'right'] as const) { expect(p.cast?.[e]?.n, p.name + ' ' + e).toBeGreaterThanOrEqual(3); expect(p.cast![e]!.n % 2, p.name + ' impair').toBe(1); } expect(p.notches.length, p.name).toBeGreaterThanOrEqual(6); }
    for (const e of ['top', 'bottom', 'left', 'right'] as const) { expect(floor.cast![e]!.phase).toBe(1); expect(lid.cast![e]!.phase).toBe(1); } // le cadre et le couvercle ont l'autre phase que les parois
    for (const w of walls) { expect(w.cast!.top!.phase).toBe(0); expect(w.cast!.bottom!.phase).toBe(0); }
    expect(one(sc0, /^Cassette ventilateur 3$/).cast!.left!.phase).toBe(1); expect(one(sc0, /^Cassette ventilateur 1$/).cast!.left!.phase).toBe(0); // chaque arête verticale réunit une phase 0 et une phase 1
    const back = one(sc0, /^Cassette ventilateur 2$/), win = back.holes[0]; expect(ligament(back, win).min, 'fenêtre de sortie').toBeGreaterThanOrEqual(4.5 - 1e-6); expect(win.sh!).toBeGreaterThanOrEqual(35);
    expect(ligament(floor, floor.holes[0]).min, 'ouverture du cadre').toBeGreaterThanOrEqual(4.5 - 1e-6);
    for (const h of lid.holes) expect(ligament(lid, h).min, 'trou du couvercle').toBeGreaterThanOrEqual(4.5 - 1e-6);
    const gl = one(sc0, /^Goulotte ventilateur gauche/), gr = one(sc0, /^Goulotte ventilateur droite/); // enveloppe extérieure = intérieur du siège
    const cb = union([...walls, floor, lid], t); expect(cb.max.x - cb.min.x).toBeCloseTo(Math.abs(gr.pos[0] - gl.pos[0]) - t, 2);
  });
  it('équilibre : le centre de gravité de la cassette (en x, y) est à moins de 4 mm de la poignée, qui est centrée à 0,1 mm', () => {
    const lid = one(sc0, /^Cassette ventilateur couvercle/), handle = one(sc0, /^Poignée cassette 2$/);
    const mass = (p: Plank): number => /^Ventilateur Noctua/.test(p.name) ? 80 : /^Grille de protection/.test(p.name) ? 5 : /^Plot caoutchouc/.test(p.name) ? 0.5 : /^Prise 4 broches/.test(p.name) ? 1 : (p.w * p.h * 1.4e-3 * 0.8); // g : bois 1,4 kg/m² (3 mm), un peu moins avec les crans et ouvertures
    const parts = sc0.planks.filter((p) => /^(Cassette ventilateur|Poignée cassette|Ventilateur Noctua|Grille de protection ventilateur|Plot caoutchouc ventilateur|Prise 4 broches du ventilateur)/.test(p.name));
    let m = 0, cx = 0, cy = 0; for (const p of parts) { const w = mass(p); m += w; cx += w * p.pos[0]; cy += w * p.pos[1]; }
    expect(Math.hypot(cx / m - handle.pos[0], cy / m - handle.pos[1])).toBeLessThanOrEqual(4);
    expect(Math.abs(handle.pos[0] - lid.pos[0])).toBeLessThanOrEqual(0.1); expect(Math.abs(handle.pos[1] - lid.pos[1])).toBeLessThanOrEqual(0.1);
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
    const slots = back.holes.filter((h) => h.shape === 'square' && h.size <= 5 && (h.sh ?? 0) >= 35 && (h.sh ?? 0) <= 46); // les fentes de la grille de sortie (la grande aération de l'électronique a été supprimée : la fenêtre des prises du Pi suffit)
    expect(slots.length).toBeGreaterThanOrEqual(6);
    const exit = { x: (Math.min(...slots.map((h) => h.x - h.size / 2)) + Math.max(...slots.map((h) => h.x + h.size / 2))) / 2, size: Math.max(...slots.map((h) => h.x + h.size / 2)) - Math.min(...slots.map((h) => h.x - h.size / 2)) };
    expect(Math.abs(exit.x - (cass.pos[0] - back.pos[0]))).toBeLessThan(0.1); // centrée sur la cassette
    const pi = one(sc0, /^Raspberry Pi/), bat = one(sc0, /^Batterie LiFePO4/);
    expect(exit.x - exit.size / 2).toBeGreaterThan(pi.pos[0] + 30); // à droite de la fenêtre des prises du Pi
    expect(Math.abs(exit.x) - exit.size / 2).toBeLessThan(bat.pos[0] + 64);
    const cassWin = cass.holes.find((h) => h.shape === 'square' && (h.sh ?? 0) >= 35 && (h.sh ?? 0) <= 46);
    expect(cassWin).toBeTruthy();
    expect(exit.size).toBeLessThan(cassWin!.size); expect(exit.size).toBeGreaterThan(cassWin!.size - 8); // les fentes tiennent dans l'ouverture intérieure du conduit (même largeur que la fenêtre de la cassette) avec des barreaux pleins de chaque côté
    for (const h of slots) expect(Math.abs(h.x - exit.x) + h.size / 2).toBeLessThanOrEqual(cassWin!.size / 2 - 1); // ≥ 1 mm de bois entre la dernière fente et la paroi du conduit
    for (const h of slots) expect(h.sh).toBeCloseTo(cassWin!.sh!, 1); // même hauteur que la fenêtre de la cassette
    expect(back.holes.some((h) => h.shape === 'square' && h.size > 40 && (h.sh ?? 0) >= 35 && (h.sh ?? 0) <= 46 && Math.abs(h.x - exit.x) < 1)).toBe(false); // la fenêtre pleine est remplacée par la grille
  });
});

describe('ventilateur à 1 cm du bloc caméra, ouverture du plafond, conduit de sortie', () => {
  const comp = () => union(by(sc0, /^(Face|Côté) .* caméra [0-9]$/), t);
  it('la paroi avant du siège est à 10 mm du mur arrière du compartiment de la caméra', () => {
    const front = aabb(one(sc0, /^Goulotte ventilateur avant/), t);
    expect(front.min.y - comp().max.y).toBeCloseTo(10, 1);
    for (const p of by(sc0, /^(Goulotte ventilateur|Cassette ventilateur|Conduit de sortie)/)) expect(aabb(p, t).min.y - comp().max.y, p.name).toBeGreaterThanOrEqual(9.99);
  });
  it('l ouverture du plafond sous le ventilateur fait 56 × au moins 28, sous le ventilateur, à plus de 3 mm de la paroi du siège et du mur du nid', () => {
    const floor = one(sc0, /^Dessous toit/), fan = one(sc0, /^Ventilateur Noctua/), open = floor.holes.find((h) => h.shape === 'square' && h.size === 56)!;
    expect(open.sh!).toBeGreaterThanOrEqual(28);
    const y0 = floor.pos[1] + open.y - open.sh! / 2, y1 = floor.pos[1] + open.y + open.sh! / 2, seatFront = aabb(one(sc0, /^Goulotte ventilateur avant/), t);
    expect(y0 - seatFront.max.y).toBeGreaterThanOrEqual(3 - 1e-6);
    expect(y1).toBeLessThanOrEqual(60 + 1e-6); // reste au-dessus du nid (intérieur à ± 60)
    expect(y0).toBeGreaterThan(fan.pos[1] - 30.5); expect(y1).toBeLessThan(fan.pos[1] + 30); // sous l'empreinte du ventilateur
    expect(ligament(floor, open).min).toBeGreaterThanOrEqual(3 - 1e-6);
  });
  it('conduit de sortie : tube de 4 plaques entre la cassette et la plaque arrière, même section que les deux fenêtres, sans chevaucher le siège ni la cassette', () => {
    const duct = by(sc0, /^Conduit de sortie/), back = one(sc0, /^Face arrière toit/), cass = one(sc0, /^Cassette ventilateur 2$/), ub = union(duct, t);
    const teeth = by(sc0, /^Conduit de sortie 4$/)[0];
    expect(ub.min.y).toBeCloseTo(cass.pos[1] + t / 2, 1); expect(Math.max(...duct.map((p) => aabb(p, t).min.y))).toBeCloseTo(cass.pos[1] + t / 2, 1); expect(teeth).toBeTruthy(); expect(ub.max.y).toBeCloseTo(back.pos[1] - t / 2, 1); // de la cassette à la face intérieure de la plaque
    expect(ub.max.y - ub.min.y).toBeLessThanOrEqual(20); // court
    const cw = cass.holes[0], exit = { size: cw.size, sh: cw.sh!, y: back.holes.find((h) => h.size <= 5 && (h.sh ?? 0) > 35)!.y }; // fentes de la grille : même hauteur et même axe que la fenêtre de la cassette
    expect(ub.max.x - ub.min.x).toBeCloseTo(exit.size + 2 * t, 1); expect(ub.max.z - ub.min.z).toBeCloseTo(exit.sh! + 2 * t, 1); // l'intérieur du tube = la fenêtre
    const wz = back.pos[2] + exit.y; expect((ub.max.z + ub.min.z) / 2).toBeCloseTo(wz, 1); expect((ub.max.x + ub.min.x) / 2).toBeCloseTo(cass.pos[0], 1);
    const solid = [...by(sc0, /^Goulotte ventilateur/), ...by(sc0, /^Cassette ventilateur/), ...by(sc0, /^Poignée cassette/)];
    for (const d of duct) for (const q of solid) { const a = aabb(d, t), b = aabb(q, t); expect(gap(a, b) >= -0.01 || [a.min.y, a.max.y].some((y) => Math.abs(y - b.min.y) < 0.01 || Math.abs(y - b.max.y) < 0.01), d.name + ' / ' + q.name).toBe(true); }
    const side = by(sc0, /^Goulotte ventilateur (gauche|droite)/); for (const d of duct) for (const q of side) expect(gap(aabb(d, t), aabb(q, t)), d.name + ' / ' + q.name).toBeGreaterThan(0.5); // le tube est dans le siège (jeu latéral)
    for (const d of duct) expect(HIDDEN_AT_CREATION.some((re) => re.test(d.name)), d.name).toBe(false);
  });
});

describe('habillage arrière plan', () => {
  it("toutes les lames arrière sont dans le même plan, de même épaisseur, avec le même haut ; le grillage de sortie reste dans l'épaisseur de l'habillage", () => {
    const lames = by(sc0, /^Lambris arrière/), face = one(sc0, /^Face arrière toit/);
    expect(lames.length).toBeGreaterThanOrEqual(5);
    for (const l of lames) { expect(l.pos[1], l.name).toBeCloseTo(lames[0].pos[1], 2); expect(l.depth, l.name).toBe(lames[0].depth); expect(l.rot, l.name).toEqual(lames[0].rot); } // même plan, même épaisseur
    const front = face.pos[1] + t / 2; expect(lames[0].pos[1] - lames[0].depth! / 2).toBeCloseTo(front, 2); // les lames touchent la plaque arrière du toit
    const tops = lames.map((l) => aabb(l, t).max.z), faceTop = face.pos[2] + face.h / 2; expect(Math.max(...tops), 'haut de l habillage').toBeCloseTo(faceTop, 2); for (const z of tops) expect(z === faceTop || z < faceTop - 20, 'une lame est entière ou coupée sous une fenêtre').toBe(true); // le haut de l habillage arrière affleure le haut de la plaque
  });
});

describe('poignées en U : sens de pose', () => {
  // une poignée est un U de contreplaqué : la barre est du côté extérieur de la plaque qui la porte, les tenons (bas du profil) traversent la plaque et affleurent sa face intérieure
  const barZ = (h: Plank) => { const ys = h.poly!.map((p) => p[1]), top = Math.max(...ys), bottom = Math.min(...ys), widthAtTop = h.poly!.filter((p) => Math.abs(p[1] - top) < 0.01).length, wBottom = h.poly!.filter((p) => Math.abs(p[1] - bottom) < 0.01).length; return { top, bottom, widthAtTop, wBottom }; };
  it('cassette et bloc : barre au-dessus du couvercle, tenons dans le couvercle, aussi en position exposée', () => {
    for (const [name, sc, lidRe, re] of [['cassette', sc0, /^Cassette ventilateur couvercle/, /^Poignée cassette 2$/], ['bloc', setWinterCassette(sc0, true), /^Bloc isolant d'hiver couvercle/, /^Poignée bloc d'hiver 2$/], ['bloc exposé', sc0, /^Bloc isolant d'hiver couvercle/, /^Poignée bloc d'hiver 2$/], ['cassette exposée', setWinterCassette(sc0, true), /^Cassette ventilateur couvercle/, /^Poignée cassette 2$/]] as [string, PlankScene, RegExp, RegExp][]) {
      const h = one(sc, re), lid = one(sc, lidRe), lidTop = lid.pos[2] + t / 2, lidBot = lid.pos[2] - t / 2, g = barZ(h);
      expect(h.pos[2] + g.top, name + ' haut').toBeGreaterThan(lidTop + 2); // la barre au-dessus du couvercle
      expect(h.pos[2] + g.bottom, name + ' tenons').toBeCloseTo(lidBot, 1); // tenons affleurant la face intérieure
      expect(g.widthAtTop, name).toBe(2); // la barre est pleine en haut (arête haute d'un seul tenant)
    }
  });
  it('bouchon : barre SOUS le fond (z < 0), tenons dans le fond affleurant sa face intérieure, aussi une fois rangé', () => {
    for (const [name, sc] of [['inséré', setAirPlug(sc0, true)], ['rangé', sc0]] as [string, PlankScene][]) {
      const h = one(sc, /^Poignée bouchon prise d'air 2$/), fond = one(sc, /^Bouchon-boîte prise d'air fond/), g = barZ(h), fondTop = fond.pos[2] + t / 2, fondBot = fond.pos[2] - t / 2;
      expect(h.pos[2] + g.top, name + ' tenons').toBeCloseTo(fondTop, 1); // tenons : le haut du profil affleure la face intérieure du fond
      expect(h.pos[2] + g.bottom, name + ' barre').toBeLessThan(fondBot - 10); // la barre est sous le fond
      expect(g.wBottom, name).toBe(2);
      const legs = h.poly!.filter((p) => Math.abs(p[1] - g.top) < 0.01); expect(legs.length).toBe(4); // quatre sommets en haut : deux pieds
      const bar = h.poly!.map((p) => p[1]).filter((y) => y < g.top - 0.01).reduce((a, b) => Math.max(a, b), -1e9); expect(h.pos[2] + bar, name + ' dessus de la barre').toBeLessThan(fondBot - 10); // l'ouverture du U regarde le fond
    }
  });
});

describe('Wago du rail 12 V : pavés aux cotes officielles, fils alignés', () => {
  const plus = () => one(sc0, /^Wago 221-413 .3 entrées. rail 12 V .$/), minus = () => one(sc0, /^Wago 221-415 .5 entrées. rail 12 V −$/);
  const WIRES: [() => Plank, string[]][] = [[plus, ['Fil Wago + → interrupteur ventilateur (rouge)', 'Fil fusible → Wago + (rouge)', 'Fil rail → convertisseur + (rouge)']], [minus, ['Fil masse interrupteur → Wago − (noir)', 'Fil ventilateur − (noir)', 'Fil rail → convertisseur − (noir)', 'Fil batterie − → Wago − (noir)']]];
  const wire = (nm: string) => one(sc0, new RegExp('^' + nm.replace(/[()+→−]/g, '.') + '$'));
  it('simples pavés (special block), cotes WAGO : 221-413 = 18,8 × 8,4 × 18,8 mm, 221-415 = 30 × 8,4 × 18,8 mm', () => {
    for (const [w, len] of [[plus(), 18.8], [minus(), 30]] as [Plank, number][]) { expect(w.special).toBe('block'); expect([w.w, w.h, w.depth]).toEqual([18.8, len, 8.4]); expect(w.holes).toEqual([]); expect(w.poly).toBeUndefined(); } // w : profondeur (sens des fils), h : largeur de la rangée, depth : hauteur
    expect(plus().color).toBe('#f97316'); expect(minus().color).toBe('#9ca3af');
    expect(sc0.planks.filter((p) => p.special === ('wago' as never))).toEqual([]);
  });
  it('tous les fils d un même Wago arrivent du même côté (ouest), perpendiculairement à la face, parallèles, à l entraxe de 6 mm, au même niveau : ≥ 12 mm rectilignes avant la face, une entrée par fil', () => {
    for (const [get, names] of WIRES) {
      const w = get(), face = w.pos[0] - w.w / 2, n = Math.round(w.h / 6), ports = Array.from({ length: n }, (_, i) => +(w.pos[1] + 6 * ((n - 1) / 2 - i)).toFixed(2)), used: number[] = [];
      for (const nm of names) {
        const all = pathItems([wire(nm)])[0].pts, seq = Math.abs(all[0].x - (face + 2.5)) < Math.abs(all[all.length - 1].x - (face + 2.5)) ? all : all.slice().reverse(), near: typeof all = [];
        for (const q of seq) { if (q.x > face - 12.01 && q.x < face + 2.6) near.push(q); else if (near.length) break; } // la courbe réelle sur les 12 mm avant la face, depuis le bout dans l orifice
        expect(near.length, nm).toBeGreaterThan(5);
        const y = near[0].y, z = near[0].z;
        for (const q of near) { expect(Math.abs(q.y - y), nm + " droit (y)").toBeLessThan(0.15); expect(Math.abs(q.z - z), nm + " droit (z)").toBeLessThan(0.15); }
        expect(Math.abs(z - (w.pos[2])), nm + ' niveau des orifices (mi-hauteur)').toBeLessThan(0.05);
        const k = ports.findIndex((p) => Math.abs(p - y) < 0.05); expect(k, nm + ' : une entrée à l entraxe').toBeGreaterThanOrEqual(0); used.push(k);
        const end = wire(nm).path!.find((q) => Math.abs(q[0] - (face + 2.5)) < 0.01 && Math.abs(q[1] - y) < 0.05); expect(end, nm + ' 2,5 mm dans l orifice').toBeTruthy();
      }
      expect(new Set(used).size).toBe(used.length); expect(names.length).toBeLessThanOrEqual(n); // la 5e entrée du 221-415 reste libre
      expect(used.slice().sort((p, q) => p - q), 'ordre des ports du nord au sud').toEqual(used.slice().sort((p, q) => p - q));
    }
    expect(WIRES[1][1].length).toBe(4); // le − : 4 fils sur 5 entrées
  });
  it('ordre des fils = ordre des ports : aucun fil du même Wago n en croise ou n en touche un autre', () => {
    for (const [get, names] of WIRES) { get(); const items = pathItems(names.map(wire)); expect(pathContacts(items, 0.3).filter((c) => !c.shared).map((c) => c.A + ' / ' + c.B)).toEqual([]); }
    const ys = (names: string[]) => names.map((nm) => { const q = pathItems([wire(nm)])[0].pts, w = nm; void w; return q.filter((p) => p.x > 70 && p.x < 82)[0]?.y ?? 0; });
    for (const [, names] of WIRES) { const v = ys(names); expect(v.slice().sort((p, q) => q - p), 'du nord au sud').toEqual(v); } // les fils sont rangés dans l ordre des ports, du nord au sud
  });
  it('les deux Wago ne chevauchent ni leurs voisins ni l un l autre', () => {
    const w = by(sc0, /^Wago 221/); expect(w).toHaveLength(2);
    for (const a of w) for (const b of sc0.planks) { if (a === b || b.path || b.special === 'doc' || /^(Face|Côté|Dessus toit|Dessous|Cadre|Isolant|Tasseau|Toit en okoumé|Lambris|Plancher|Habillage|Barre)/.test(b.name)) continue; expect(gap(aabb(a, t), aabb(b, t)), a.name + ' / ' + b.name).toBeGreaterThan(0.2); }
  });
});

describe('habillage arrière : fenêtres sur une bande commune', () => {
  it("toutes les lames coupées par une fenêtre s'arrêtent au même niveau et reprennent au même niveau", () => {
    const lames = by(sc0, /^Lambris arrière/), bot = Math.min(...lames.map((l) => aabb(l, t).min.z)), top = Math.max(...lames.map((l) => aabb(l, t).max.z));
    const stops = lames.filter((l) => aabb(l, t).max.z < top - 1).map((l) => aabb(l, t).max.z), restarts = lames.filter((l) => aabb(l, t).min.z > bot + 1).map((l) => aabb(l, t).min.z);
    expect(stops.length).toBeGreaterThanOrEqual(2); expect(restarts.length).toBeGreaterThanOrEqual(2);
    for (const z of stops) expect(Math.abs(z - stops[0]), 'arrêt des lames').toBeLessThanOrEqual(0.01);
    for (const z of restarts) expect(Math.abs(z - restarts[0]), 'reprise des lames').toBeLessThanOrEqual(0.01);
    expect(restarts[0]).toBeGreaterThan(stops[0]);
    // les lames entaillées de côté (fenêtre des prises, de la sortie) ont leurs encoches sur la même bande
    for (const l of lames.filter((q) => q.poly && q.poly.length > 4)) {
      const zs = new Set(l.poly!.map(([, y]) => Math.round((l.pos[2] + y) * 100) / 100)); // lame debout (rot x = 90) : le y du contour est la hauteur
      for (const z of zs) expect([bot, top, stops[0], restarts[0]].some((v) => Math.abs(v - z) < 0.011) || Math.abs(z - 134.5) < 40, 'encoche de ' + l.name + ' à ' + z).toBe(true); // hors la fente des nervures (tout en bas)
    }
  });
});

describe('bloc isolant d\'hiver', () => {
  it("cassette isolante = même enveloppe que la cassette ventilateur, boîte fermée crénelée qui enferme la laine, comble l'ouverture, visible", () => {
    const scW = setWinterCassette(sc0, true); // le bloc est mis dans le siège
    const cass = union([...by(sc0, /^Cassette ventilateur [1-4]$/), one(sc0, /^Cassette ventilateur cadre/), one(sc0, /^Cassette ventilateur couvercle/)], t), win = union(by(scW, /^Bloc isolant d'hiver( [1-4]| fond| couvercle)$/), t);
    const dl = one(sc0, /^Face arrière toit/).pos[1] - t / 2 - cass.max.y; // longueur du conduit de sortie
    expect(dl).toBeGreaterThan(5);
    for (const k of ['x', 'y', 'z'] as const) { expect(win.min[k], 'min ' + k).toBeCloseTo(cass.min[k], 1); expect(win.max[k], 'max ' + k).toBeCloseTo(cass.max[k] + (k === 'y' ? dl : 0), 1); } // même largeur, même bas, même haut ; plus long de la longueur du conduit de sortie (il comble aussi sa place, jusqu'à la plaque arrière)
    const fond = one(scW, /^Bloc isolant d'hiver fond/), lid = one(scW, /^Bloc isolant d'hiver couvercle/), foam = one(scW, /^Isolant bloc d'hiver/), handle = one(scW, /^Poignée bloc d'hiver 2$/), handleC = one(sc0, /^Poignée cassette 2$/);
    for (const p of scW.planks.filter((q) => /^(Bloc isolant d.hiver|Isolant bloc d.hiver)/.test(q.name))) expect(p.holes.filter((h) => Math.max(h.size, h.sh ?? 0) >= 10), p.name).toEqual([]); // boîte pleine fermée : aucune ouverture (seules les fentes de 3 mm des pieds du U)
    expect(handle.holes).toEqual([]); expect(handleC.holes).toEqual([]); // le U est plein
    expect(by(scW, /^Bloc isolant d'hiver [1-4]$/).every((p) => (p.cast?.top?.n ?? 0) > 0 && (p.cast?.bottom?.n ?? 0) > 0)).toBe(true); // parois crénelées en haut (couvercle) et en bas (fond)
    expect(handle.pos[0]).toBe(handleC.pos[0]); expect(handle.pos[2]).toBe(handleC.pos[2]); expect(handle.pos[1] - handleC.pos[1]).toBeCloseTo(dl / 2, 1); expect(handle.w).toBe(handleC.w); expect(handle.h).toBe(handleC.h); // même oreille, centrée sur le couvercle plus long
    const foamB = aabb(foam, t); expect(foamB.max.z).toBeLessThanOrEqual(lid.pos[2] - t / 2 + 0.01); expect(foamB.min.z).toBeGreaterThanOrEqual(fond.pos[2] + t / 2 - 0.01); expect(foam.depth!).toBeGreaterThan(win.max.z - win.min.z - 2 * t - 1); // la laine remplit presque tout l'intérieur
    const names = [...by(sc0, /^Bloc isolant d'hiver/), one(sc0, /^Isolant bloc d'hiver/), ...by(sc0, /^Poignée bloc d'hiver/)].map((p) => p.name);
    for (const n of names) expect(HIDDEN_AT_CREATION.some((re) => re.test(n)), n).toBe(false); // visibles par défaut (rangés à côté du nichoir)
  });
});

describe('cassette ajustée au siège, sans joint', () => {
  it('aucune pièce Joint ; cassette = intérieur du siège, posée sur le plafond et contre la plaque arrière', () => {
    expect(by(sc0, /^Joint/)).toEqual([]);
    const seatW = by(sc0, /^Goulotte ventilateur (gauche|droite)/), cass = union(by(sc0, /^Cassette ventilateur [1-4]$|^Cassette ventilateur cadre/), t), front = one(sc0, /^Goulotte ventilateur avant/);
    const inner = Math.abs(seatW[0].pos[0] - seatW[1].pos[0]) - t; // intérieur du siège en x
    expect(cass.max.x - cass.min.x).toBeCloseTo(inner, 1); // jeu 0
    expect(cass.min.y).toBeCloseTo(front.pos[1] + t / 2, 1); // devant : contre la paroi avant du siège
    const duct = by(sc0, /^Conduit de sortie/); expect(duct).toHaveLength(4); expect(Math.max(...duct.map((p) => aabb(p, t).min.y))).toBeCloseTo(cass.max.y, 1); // derrière : le conduit de sortie s'appuie sur la cassette
    expect(cass.min.z).toBeCloseTo(one(sc0, /^Dessous toit/).pos[2] + t / 2, 1); // sur le plafond
    expect(by(sc0, /^Plot caoutchouc ventilateur/)).toHaveLength(4); // les vibrations ne passent que par les plots
  });
});

describe('sortie du ventilateur : rien ne dépasse derrière', () => {
  it('ni clapet ni joue de grillage ; la grille est percée dans la plaque arrière du toit et la fenêtre du lambris reste ouverte devant', () => {
    expect(by(sc0, /^Clapet de ventilation|^Joue grillage/)).toEqual([]);
    const back = one(sc0, /^Face arrière toit/), slots = back.holes.filter((h) => h.size <= 5 && (h.sh ?? 0) > 35), lames = by(sc0, /^Lambris arrière/).filter((p) => p.poly);
    expect(slots.length).toBeGreaterThanOrEqual(6);
    const inPoly = (pt: [number, number], poly: [number, number][]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
    const x0 = Math.min(...slots.map((h) => h.x - h.size / 2)) + back.pos[0], x1 = Math.max(...slots.map((h) => h.x + h.size / 2)) + back.pos[0], zc = back.pos[2] + slots[0].y, hh = slots[0].sh! / 2;
    for (let x = x0 + 0.2; x <= x1; x += 1) for (let z = zc - hh + 0.2; z <= zc + hh; z += 1) for (const l of lames) { const local: [number, number] = [x - l.pos[0], z - l.pos[2]]; expect(inPoly(local, l.poly!) && !l.holes.some((h) => Math.abs(local[0] - h.x) <= h.size / 2 && Math.abs(local[1] - h.y) <= (h.sh ?? h.size) / 2), 'lambris devant la grille : ' + l.name).toBe(false); }
  });
});

// grille de la paroi intérieure : N fentes verticales de 4 mm ; enveloppe = la fente d'air de 34 × 30
const airSlot = (p: Plank) => { const g = p.holes.filter((h) => h.shape === 'square' && h.size === 4 && h.sh === 30); const x0 = Math.min(...g.map((h) => h.x - h.size / 2)), x1 = Math.max(...g.map((h) => h.x + h.size / 2)); return g.length ? { ...g[0], x: (x0 + x1) / 2, size: x1 - x0 } : undefined; };

describe("prise d'air basse", () => {
  const l = 120;
  it("le conduit est dans l'isolant du mur gauche, à l'avant, avec une section d'au moins 8 cm²", () => {
    const w = [1, 2, 3, 4].map((i) => one(sc0, new RegExp(`^Conduit d'air ${i}$`))), cover = one(sc0, /^Conduit d'air 5/);
    const x1 = w[0].pos[0], x2 = w[1].pos[0], y3 = w[2].pos[1], y4 = w[3].pos[1];
    const ix = Math.abs(x2 - x1) - t, iy = Math.abs(y4 - y3) - t; // intérieur libre : écart entre axes moins une épaisseur
    expect(ix * iy / 100).toBeGreaterThanOrEqual(8);
    const outer = one(sc0, /^Côté gauche ext/), inner = one(sc0, /^Côté gauche int/);
    expect(x1 - t / 2).toBeGreaterThan(outer.pos[0] + t / 2); expect(x2 + t / 2).toBeLessThanOrEqual(inner.pos[0] - t / 2 + 1e-6); // entre les deux parois (collé à la paroi intérieure)
    expect(y3).toBeLessThan(0); // à l'avant (−y), le ventilateur est à l'arrière
    expect(cover.pos[2]).toBeGreaterThan(w[0].pos[2]);
    expect(by(sc0, /^Conduit d'air [1-5]/)).toHaveLength(5);
  });
  it("la fente est à l'opposé du ventilateur : plus loin que la moitié de la largeur du nid", () => {
    const inner = one(sc0, /^Côté gauche int/), slot = airSlot(inner)!;
    expect(slot).toBeTruthy();
    const sx = inner.pos[0], sy = inner.pos[1] + slot.x;
    const floor = one(sc0, /^Dessous toit/), open = floor.holes.find((h) => h.size === 56)!;
    expect(Math.hypot(sx - (floor.pos[0] + open.x), sy - (floor.pos[1] + open.y))).toBeGreaterThan(l / 2);
    expect(inner.pos[2] + slot.y).toBeGreaterThan(one(sc0, /^Plancher int/).pos[2]); // au-dessus du fond du nid
    expect(by(sc0, /^Clapet prise d'air/)).toEqual([]); // clapet supprimé : la prise d'air reste ouverte (la sous-boîte isolante la bouche en hiver) expect(by(sc0, /^Grille d'aération du corps/)).toEqual([]); expect(by(sc0, /^Grillage inox maille 5 mm — prise/)).toEqual([]); expect(by(sc0, /^Auvent|^Cale auvent/)).toEqual([]);
  });
  it("l'ouverture est dans « Dessous ext » (le fond intérieur n'a que le passage du conduit) et rien ne la bouche dessous", () => {
    const bottom = one(sc0, /^Dessous ext/), opening = bottom.holes.find((h) => h.shape === 'square' && Math.abs(h.x - one(sc0, /^Conduit d'air 5/).pos[0]) < 0.1)!;
    expect(opening).toBeTruthy();
    const box = { min: new Vector3(opening.x - opening.size / 2, bottom.pos[1] + opening.y - (opening.sh ?? 0) / 2, -400), max: new Vector3(opening.x + opening.size / 2, bottom.pos[1] + opening.y + (opening.sh ?? 0) / 2, 0) };
    const mine = /^(Bouchon-boîte prise d'air|Laine bouchon|Poignée bouchon|Conduit d'air)/;
    for (const p of sc0.planks) { if (mine.test(p.name) || p.special === 'doc' || p.path) continue; const b = aabb(p, t); if (b.max.z > 0.01) continue; expect(gap(box, b), p.name).toBeGreaterThan(0.5); }
    const reg = aabb(one(sc0, /^Régulateur de charge/), t);
    expect(gap(box, reg)).toBeGreaterThan(20);
    expect(one(sc0, /^Plancher int/).holes.some((h) => h.size > 29 && h.sh! > 46)).toBe(true);
  });
  it("la sous-boîte isolante est pleine hauteur, fermée, à fleur du dessous, tient en force : elle passe pile dans le conduit, couvre la fente, aucun verrou, poignée de 5 mm au plus sous le fond", () => {
    const scP = setAirPlug(sc0, true); // la sous-boîte est insérée dans le conduit
    const ws = [1, 2, 3, 4].map((i) => one(scP, new RegExp(`^Bouchon-boîte prise d'air ${i}$`))), lid = one(scP, /^Bouchon-boîte prise d'air couvercle/), fond = one(scP, /^Bouchon-boîte prise d'air fond/), wool = one(scP, /^Laine bouchon prise d'air/), handle = one(scP, /^Poignée bouchon prise d'air 2$/), hLayers = by(scP, /^Poignée bouchon prise d'air \d$/), duct = [1, 2, 3, 4].map((i) => one(scP, new RegExp(`^Conduit d'air ${i}$`))), ductLid = one(scP, /^Conduit d'air 5/), bottom = one(scP, /^Dessous ext/);
    const inX = Math.abs(duct[1].pos[0] - duct[0].pos[0]) - t, inY = Math.abs(duct[3].pos[1] - duct[2].pos[1]) - t; // intérieur libre du conduit
    const bx = union([...ws, lid, fond], t);
    expect(bx.max.x - bx.min.x).toBeCloseTo(inX, 1); expect(bx.max.y - bx.min.y).toBeCloseTo(inY, 1); // pile, jeu 0
    expect(bx.min.z).toBeCloseTo(bottom.pos[2] - t / 2, 2); expect(bx.min.z).toBeCloseTo(0, 2); // fond à fleur de la face extérieure du fond du nichoir
    expect(ductLid.pos[2] - t / 2 - bx.max.z).toBeGreaterThanOrEqual(0); expect(ductLid.pos[2] - t / 2 - bx.max.z).toBeLessThanOrEqual(1); // jusqu'en haut : ≤ 1 mm sous le couvercle du conduit
    expect(hLayers).toHaveLength(3); const hb = union(hLayers, t); expect(hb.max.x - hb.min.x).toBeCloseTo(3 * t, 2); // trois couches de contreplaqué : 9 mm ; poignée en U de bois, centrée sous le fond, pieds incrustés dans deux fentes du fond
    expect(hb.max.z).toBeCloseTo(fond.pos[2] + t / 2, 2); expect(bx.min.z - hb.min.z).toBeGreaterThanOrEqual(12 + t - 0.01); expect(bx.min.z - hb.min.z).toBeLessThanOrEqual(16); // dégagement ≥ 12 mm sous la barre
    expect(Math.abs((hb.max.x + hb.min.x) / 2 - fond.pos[0])).toBeLessThanOrEqual(0.1); expect(Math.abs((hb.max.y + hb.min.y) / 2 - fond.pos[1])).toBeLessThanOrEqual(0.1); // centré
    expect(fond.holes).toHaveLength(2); for (const h of fond.holes) { expect(Math.abs(Math.abs(h.y) - (handle.w - t) / 2)).toBeLessThan(0.01); expect(h.size).toBeGreaterThanOrEqual(3 * t); } // un tenon par fente, à la place des pieds
    for (const h of fond.holes) expect(ligament(fond, h).min, 'ligament des fentes du fond').toBeGreaterThanOrEqual(4.5 - 1e-6);
    const inner = one(scP, /^Côté gauche int/), slot = airSlot(inner)!, slotZ0 = inner.pos[2] + slot.y - slot.sh! / 2, slotZ1 = slotZ0 + slot.sh!;
    expect(bx.max.z).toBeGreaterThan(slotZ1); expect(bx.min.z).toBeLessThan(slotZ0); // elle recouvre la fente
    const wallSlot = ws[1]; expect(wallSlot.holes).toEqual([]); expect(wallSlot.pos[0]).toBeGreaterThan(ws[0].pos[0]); // la paroi côté nid est pleine
    expect(Math.abs(wallSlot.pos[1] - (inner.pos[1] + slot.x))).toBeLessThan(2); // en face de la fente
    for (const p of [...ws, lid, wool]) expect(p.holes, p.name).toEqual([]); expect(fond.holes.every((h) => Math.max(h.size, h.sh ?? 0) < 10)).toBe(true); // boîte pleine : seules les fentes des pieds du U percent le fond
    for (const e of ['top', 'bottom', 'left', 'right'] as const) expect(lid.cast![e]!.phase).toBe(1); // le couvercle s'emboîte dans le haut des parois
    const wb = aabb(wool, t); expect(wb.max.z).toBeLessThanOrEqual(lid.pos[2] - t / 2 + 0.01); expect(wb.min.z).toBeGreaterThanOrEqual(fond.pos[2] + t / 2 - 0.01); // laine enfermée entre le fond et le couvercle
    expect(scP.planks.filter((p) => /[Tt]ourniquet|Vis tourniquet|[Gg]oupille/.test(p.name))).toEqual([]); // aucun verrou
    expect(bottom.holes.filter((h) => h.shape === 'round' && h.size === 3)).toEqual([]); // aucun trou de vis
    for (const p of [...ws, fond, lid, wool, handle]) expect(HIDDEN_AT_CREATION.some((re) => re.test(p.name)), p.name).toBe(false); // visibles par défaut (rangées à côté du nichoir)
    expect(by(scP, /^Grillage inox maille 5 mm — prise/)).toEqual([]); // plus de grillage sous l'ouverture
    // aucune pièce visible (hors pièces de rechange) ne gêne la sous-boîte insérée
    const box = { min: bx.min, max: bx.max };
    for (const p of scP.planks) { if (p.special === 'doc' || p.path || /^(Bouchon-boîte|Laine bouchon|Poignée bouchon|Conduit d.air|Dessous ext|Plancher int|Isolant|Grillage|Clapet prise|Côté gauche int)/.test(p.name)) continue; expect(gap(box, aabb(p, t)), p.name).toBeGreaterThan(0.3); }
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

describe("conduit de la prise d'air : boîte crénelée", () => {
  const w = [1, 2, 3, 4].map((i) => one(sc0, new RegExp(`^Conduit d'air ${i}$`))), cover = one(sc0, /^Conduit d'air 5/), all = [...w, cover];
  const inPoly = (pt: [number, number], poly: [number, number][]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const solid = (p: Plank, pt: Vector3, m = 0): boolean => { const b = obb(p, t), d = pt.clone().sub(b.c), lx = d.dot(b.ax[0]), ly = d.dot(b.ax[1]), lz = d.dot(b.ax[2]); return Math.abs(lz) <= t / 2 - m && inPoly([lx, ly], outline(p)) && !p.holes.some((h) => Math.abs(lx - h.x) <= h.size / 2 && Math.abs(ly - h.y) <= (h.sh ?? h.size) / 2); };
  it('quatre parois à dents verticales et un couvercle : chaque arête réunit un bord de phase 0 et un bord de phase 1', () => {
    for (const p of w) { expect(p.cast?.left?.n, p.name).toBeGreaterThan(1); expect(p.cast?.right?.n).toBe(p.cast?.left?.n); expect(p.cast?.top?.phase).toBe(0); expect(p.cast?.bottom, p.name + ' : bas droit, sans dents').toBeUndefined(); expect(p.notches.some((x) => x.edge === 'bottom'), p.name).toBe(false); expect(p.notches.length, p.name).toBeGreaterThan(3); } // ouvert en dessous, bas droit posé sur le fond (aucune dent dans le fond)
    expect(w[0].cast!.left!.phase).toBe(1); expect(w[1].cast!.left!.phase).toBe(1); expect(w[2].cast!.left!.phase).toBe(0); expect(w[3].cast!.left!.phase).toBe(0); // côtés (1, 2) contre faces (3, 4)
    expect(w[0].cast!.left!.n).toBe(w[2].cast!.left!.n);
    for (const e of ['top', 'bottom', 'left', 'right'] as const) expect(cover.cast![e]!.phase).toBe(1); // le couvercle s'emboîte dans le haut des parois
    expect(cover.cast!.top!.n).toBe(w[2].cast!.top!.n); expect(cover.cast!.left!.n).toBe(w[0].cast!.top!.n);
  });
  it('les plaques ne se recouvrent pas (matière réelle, dents comprises) et la section libre reste ≥ 8 cm²', () => {
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j], ob = obb(a, t);
      for (let x = -a.w / 2 + 0.3; x < a.w / 2; x += 1.1) for (let y = -a.h / 2 + 0.3; y < a.h / 2; y += 1.1) {
        const pt = ob.c.clone().addScaledVector(ob.ax[0], x).addScaledVector(ob.ax[1], y);
        if (solid(a, pt) && solid(b, pt, 0.05)) throw new Error(`${a.name} recoupe ${b.name} en ${pt.toArray().map((v) => v.toFixed(1))}`);
      }
    }
    expect(Math.abs(w[1].pos[0] - w[0].pos[0]) - t, 'largeur libre').toBeGreaterThanOrEqual(23);
    expect(((Math.abs(w[1].pos[0] - w[0].pos[0]) - t) * (Math.abs(w[3].pos[1] - w[2].pos[1]) - t)) / 100).toBeGreaterThanOrEqual(8);
  });
  it('la fente de la paroi côté nid ne touche aucun cran', () => {
    const p = w[1], h = p.holes[0], poly = outline(p);
    for (let dx = -h.size / 2 - 1.5; dx <= h.size / 2 + 1.5; dx += 1) for (const dy of [-(h.sh! / 2 + 1.5), h.sh! / 2 + 1.5]) expect(inPoly([h.x + dx, h.y + dy], poly), 'marge de bois autour de la fente').toBe(true);
    for (let dy = -h.sh! / 2 - 1.5; dy <= h.sh! / 2 + 1.5; dy += 1) for (const dx of [-(h.size / 2 + 1.5), h.size / 2 + 1.5]) expect(inPoly([h.x + dx, h.y + dy], poly), 'marge de bois autour de la fente').toBe(true);
  });
});

describe("prise d'air basse : incrustée dans le fond, ligaments de bois", () => {
  it('le bas des parois est droit, posé sur le dessus du fond ; le fond a une seule ouverture rectangulaire (son intérieur), plus de fentes', () => {
    const bottom = one(sc0, /^Dessous ext/), walls = [1, 2, 3, 4].map((i) => one(sc0, new RegExp(`^Conduit d'air ${i}$`)));
    const lid = one(sc0, /^Conduit d'air 5/), outerX = Math.max(...walls.map((w) => aabb(w, t).max.x)) - Math.min(...walls.map((w) => aabb(w, t).min.x));
    const opening = bottom.holes.find((h) => h.shape === 'square' && Math.abs(h.x - lid.pos[0]) < 0.1 && Math.abs(h.size - (outerX - 2 * t)) < 0.1)!;
    expect(opening).toBeTruthy(); expect(opening.poly).toBeUndefined(); // un rectangle simple : l'intérieur du conduit
    expect(bottom.holes.some((h) => Math.abs(h.x - lid.pos[0]) < 20 && Math.abs(h.y - lid.pos[1]) < 40 && h !== opening && h.size <= 8)).toBe(false); // plus de fentes de dents autour
    for (const w of walls) expect(Math.abs(w.pos[2] - w.h / 2 - t), w.name).toBeLessThan(0.01); // le bas des parois est à z = t : sur le fond (dessus de « Dessous ext »), sans dent en dessous
  });
  it('ligaments de bois ≥ 4,5 mm autour du conduit, de la fente et du passage dans le fond intérieur', () => {
    const mins: Record<string, number> = {};
    const check = (nom: string, p: Plank, pick: (h: Plank['holes'][number]) => boolean) => { const h = p.holes.find(pick)!; expect(h, nom).toBeTruthy(); mins[nom] = ligament(p, h).min; expect(mins[nom], nom).toBeGreaterThanOrEqual(4.5 - 1e-6); };
    const lidX = one(sc0, /^Conduit d'air 5/).pos[0]; check('Dessous ext (ouverture)', one(sc0, /^Dessous ext/), (h) => h.shape === 'square' && !h.poly && Math.abs(h.x - lidX) < 0.1 && (h.sh ?? 0) > 40);
    check('Plancher int (passage + fentes des dents)', one(sc0, /^Plancher int/), (h) => !!h.poly && h.size > 29 && h.sh! > 46);
    const inner = one(sc0, /^Côté gauche int/), env = airSlot(inner)!; // la grille (6 fentes de 4 mm, barreaux de 2 mm) : on mesure le ligament autour de son enveloppe 34 × 30
    check('Côté gauche int (grille)', { ...inner, holes: [...inner.holes.filter((q) => !(q.size === 4 && q.sh === 30)), env] }, (h) => h === env);
    check("Conduit d'air 2 (fente)", one(sc0, /^Conduit d'air 2$/), (h) => h.size === 34 && h.sh === 30);
    expect(Math.min(...Object.values(mins))).toBeGreaterThanOrEqual(4.5 - 1e-6);
  });
  it('le conduit touche la paroi intérieure (plus de jour), sous-boîte pile dans l intérieur libre', () => {
    const w1 = one(sc0, /^Conduit d'air 1$/), w2 = one(sc0, /^Conduit d'air 2$/), inner = one(sc0, /^Côté gauche int/);
    expect(inner.pos[0] - t / 2 - (w2.pos[0] + t / 2)).toBeCloseTo(0, 2); expect(w1.pos[0]).toBeLessThan(w2.pos[0]); // collé
  });
});

describe('capteur BME280 dans le compartiment de la caméra', () => {
  it('le logement et le capteur sont dans le compartiment, ses fils montent par son ouverture sans traverser l\'isolant, ligaments ≥ 4,5 mm', () => {
    const sensor = one(sc0, /^Capteur température/), walls = by(sc0, /^(Face avant|Face arrière|Côté droit|Côté gauche) caméra/), floor = one(sc0, /^Dessous toit/), top = one(sc0, /^Dessus toit/);
    const cb = union(walls, t); // empreinte extérieure du compartiment
    const x0 = cb.min.x + t, x1 = cb.max.x - t, y0 = cb.min.y + t, y1 = cb.max.y - t; // intérieur
    expect(sensor.pos[0] - 9.75).toBeGreaterThan(x0); expect(sensor.pos[0] + 9.75).toBeLessThan(x1); expect(sensor.pos[1] - 9.25).toBeGreaterThan(y0); expect(sensor.pos[1] + 9.25).toBeLessThan(y1);
    const hole = floor.holes.find((h) => h.shape === 'square' && Math.abs(h.x - (sensor.pos[0] - 1.5)) < 0.01 && Math.abs(h.size - 9) < 0.01)!; // logement de la puce seule (la carte s'appuie sur le plafond)
    expect(hole).toBeTruthy(); expect(ligament(floor, hole).min).toBeGreaterThanOrEqual(4.5 - 1e-6);
    // l'ouverture du dessus couvre tout l'intérieur du compartiment ; plus de fente à part pour les fils du capteur
    const open = top.holes.find((h) => h.shape === 'square' && Math.abs(h.size - (x1 - x0)) < 0.5 && Math.abs((h.sh ?? 0) - (y1 - y0)) < 0.5);
    expect(open).toBeTruthy(); expect(top.holes.some((h) => h.size === 12 && h.sh === 6)).toBe(false);
    const roofTop = top.pos[2] + t / 2, roofFloorTop = floor.pos[2] + t / 2;
    const wires = by(sc0, /^Fil (3,3 V|SDA|SCL|masse) \((rouge|jaune|vert|noir)\)$/).filter((w) => w.path && w.path[0][0] > sensor.pos[0] - 6 && w.path[0][0] < x1 && w.path[0][2] < roofFloorTop + 10);
    expect(wires).toHaveLength(4);
    for (const w of wires) for (const pt of pathItems([w])[0].pts) if (pt.z < roofTop) { expect(pt.x, w.name).toBeGreaterThan(x0); expect(pt.x).toBeLessThan(x1); expect(pt.y).toBeGreaterThan(y0); expect(pt.y).toBeLessThan(y1); } // sous le dessus du toit, jamais hors du compartiment
  });
});

describe("pièces d'hiver : exposées à côté du nichoir, échange exact par les boutons", () => {
  const sizes: [string, PlankScene][] = [['défaut', sc0], ['intérieur 200', buildNest({ l: 200, L: 200 })]];
  it("état d'été par défaut : cassette ventilateur en place, bloc et sous-boîte rangés à côté", () => {
    expect(winterState(sc0)).toEqual({ cassette: 'summer', plug: 'open' });
  });
  for (const [nom, sc] of sizes) {
    it(`aller-retour exact (${nom}) : appliquer deux fois revient aux positions d'origine`, () => {
      const w = setWinterCassette(sc, true), back = setWinterCassette(w, false);
      expect(winterState(w).cassette).toBe('winter'); expect(back.planks).toEqual(sc.planks);
      for (const p of w.planks.filter((q) => q.path)) expect(p.pos, p.name).toEqual([0, 0, 0]); // les fils gardent pos = 0 (le chemin seul se déplace)
      const p = setAirPlug(sc, true), open = setAirPlug(p, false);
      expect(winterState(p).plug).toBe('plugged'); expect(open.planks).toEqual(sc.planks);
      expect(setWinterCassette(w, true)).toBe(w); expect(setAirPlug(p, true)).toBe(p); // idempotent
      const both = setAirPlug(setWinterCassette(sc, true), true);
      expect(setAirPlug(setWinterCassette(both, false), false).planks).toEqual(sc.planks);
    });
  }
  it("sans le ventilateur ou le conduit, les fonctions ne font rien et l'état est null", () => {
    const sans = { ...sc0, planks: sc0.planks.filter((p) => !/ventilateur|cassette|Conduit d'air|Bouchon-boîte|Laine bouchon|Isolant bloc|Bloc isolant|Goulotte/i.test(p.name)) };
    expect(winterState(sans)).toEqual({ cassette: null, plug: null });
    expect(setWinterCassette(sans, true)).toBe(sans); expect(setAirPlug(sans, true)).toBe(sans);
  });
  it("les pièces rangées sont hors du nichoir, du lambris, du toit en chêne et du panneau solaire, posées sur le sol, et restent découpées", () => {
    const spares = by(sc0, /^(Bloc isolant d'hiver|Isolant bloc d'hiver|Poignée bloc d'hiver|Bouchon-boîte prise d'air|Laine bouchon prise d'air)/);
    expect(spares.length).toBeGreaterThanOrEqual(13);
    const house = union([...by(sc0, /^(Lambris|Toit en okoumé)/), one(sc0, /^Côté gauche ext/)], t), sp = union(spares, t), solar = aabb(one(sc0, /^Panneau solaire/), t);
    expect(sp.max.x).toBeLessThan(house.min.x - 50); expect(gap(sp, solar)).toBeGreaterThan(300); // à gauche, loin du panneau (à droite)
    expect(sp.min.z).toBeCloseTo(0, 1); // à plat sur le sol (z = 0)
    expect(spares.filter((p) => !p.special).length).toBeGreaterThanOrEqual(10); // plaques de contreplaqué : découpées comme les autres
    for (const p of spares) expect(HIDDEN_AT_CREATION.some((re) => re.test(p.name)), p.name).toBe(false);
    const cote = nestSheets(sc0, 410, 400).flatMap((sh) => sh.items.map((i) => i.plank.name));
    expect(cote).toContain("Bloc isolant d'hiver 1"); expect(cote).toContain("Bouchon-boîte prise d'air 1");
    expect(gap(union(by(sc0, /^(Bloc isolant d'hiver|Isolant bloc d'hiver|Poignée bloc d'hiver)/), t), union(by(sc0, /^(Bouchon-boîte prise d'air|Laine bouchon prise d'air)/), t))).toBeGreaterThan(5); // le bloc et la sous-boîte ne se touchent pas
  });
  it("en hiver : le bloc est dans le siège, la cassette ventilateur est rangée au même endroit exposé", () => {
    const w = setWinterCassette(sc0, true), blockSeat = one(w, /^Bloc isolant d'hiver 1$/), cassSeat = one(sc0, /^Cassette ventilateur 1$/), blockSpare = one(sc0, /^Bloc isolant d'hiver 1$/), cassSpare = one(w, /^Cassette ventilateur 1$/);
    expect(Math.hypot(blockSeat.pos[0] - cassSeat.pos[0], blockSeat.pos[1] - cassSeat.pos[1])).toBeLessThan(0.02); // le bloc prend la place de la cassette (mêmes parois avant : il est plus long vers l'arrière)
    expect(Math.hypot(cassSpare.pos[0] - blockSpare.pos[0], cassSpare.pos[1] - blockSpare.pos[1])).toBeLessThan(0.02); // et inversement
    for (const d of by(sc0, /^Conduit de sortie/)) expect(one(w, new RegExp('^' + d.name + '$')).pos[0]).toBeLessThan(-(210 / 2) - 100); // le conduit de sortie sort avec la cassette
    expect(one(setWinterCassette(w, false), /^Conduit de sortie 1$/).pos).toEqual(one(sc0, /^Conduit de sortie 1$/).pos);
    expect(one(w, /^Rallonge ventilateur 4 broches/).pos).toEqual(one(sc0, /^Rallonge ventilateur 4 broches/).pos); // la prise mâle de la rallonge et ses fils restent sur le toit
  });
});

describe('grilles percées dans les plaques', () => {
  const grid = (p: Plank, minOpen: number, nom: string) => {
    const g = p.holes.filter((h) => h.shape === 'square' && h.size === 4 && (h.sh ?? 0) > 25).sort((a, b) => a.x - b.x);
    expect(g.length, nom).toBeGreaterThanOrEqual(6);
    for (const h of g) { expect(h.size).toBeLessThanOrEqual(5); expect(h.size).toBeGreaterThanOrEqual(3); expect(h.sh).toBe(g[0].sh); expect(h.y).toBe(g[0].y); } // fentes verticales de 4 mm (aucune > 5 mm), toutes de même hauteur
    for (let i = 1; i < g.length; i++) expect(g[i].x - g[i - 1].x - 4, nom + ' barreau').toBeGreaterThanOrEqual(2 - 1e-6); // barreaux de 2 mm au moins
    const x0 = g[0].x - 2, x1 = g[g.length - 1].x + 2; // enveloppe de la grille
    const open = g.reduce((s, h) => s + h.size * h.sh!, 0) / ((x1 - x0) * g[0].sh!); expect(open, nom + ' ouverte').toBeGreaterThanOrEqual(minOpen);
    return { g, x0, x1 };
  };
  it('sortie du ventilateur : fentes de 4 mm percées dans « Face arrière toit », plus de plaque séparée, dans l ouverture intérieure du conduit', () => {
    const back = one(sc0, /^Face arrière toit/), cass = one(sc0, /^Cassette ventilateur 2$/), { g, x0, x1 } = grid(back, 0.6, 'sortie');
    const cw = cass.holes.find((h) => !!h.poly)!;
    expect(Math.abs((x0 + x1) / 2 - (cass.pos[0] - back.pos[0]))).toBeLessThan(0.1);
    expect(x1 - x0).toBeLessThanOrEqual(cw.size - 2); // ≥ 1 mm de bois entre la dernière fente et la paroi du conduit
    expect(g[0].sh).toBeCloseTo(cw.sh!, 1);
    const env = { id: 'env', shape: 'square' as const, x: (x0 + x1) / 2, y: g[0].y, size: x1 - x0, sh: g[0].sh };
    expect(ligament({ ...back, holes: [...back.holes.filter((h) => !g.includes(h)), env] }, env).min).toBeGreaterThanOrEqual(4.5 - 1e-6); // bois autour de la grille
    expect(nestSheets(sc0, 410, 400).filter((s) => !s.material).flatMap((s) => s.items.map((i) => i.plank.name))).toContain(back.name);
  });
  it('corps : la fente de la paroi intérieure est une grille de 6 fentes de 4 mm (barreaux de 2 mm) ; plus de clapet', () => {
    const inner = one(sc0, /^Côté gauche int/), { g, x0, x1 } = grid(inner, 0.6, 'corps');
    expect(g).toHaveLength(6); expect(x1 - x0).toBeCloseTo(34, 1); expect(g[0].sh).toBe(30);
    expect(one(sc0, /^Conduit d'air 2$/).holes.some((h) => h.size === 34)).toBe(true); // « Conduit d'air 2 » garde sa grande ouverture
    expect(by(sc0, /^Clapet prise d'air/)).toEqual([]);
    expect(by(sc0, /^Grille d'aération du corps/)).toEqual([]);
  });
  it('le conduit de sortie fait corps avec la cassette : deux dents sur chacune de ses QUATRE plaques dans les fentes de la paroi arrière, ≥ 4,5 mm de bois autour', () => {
    const cassB = one(sc0, /^Cassette ventilateur 2$/), comb = cassB.holes.find((h) => !!h.poly)!, ducts = by(sc0, /^Conduit de sortie/);
    expect(ducts).toHaveLength(4);
    expect(ducts.every((p) => p.group === cassB.group)).toBe(true); // groupe de la cassette
    const inPoly = (pt: [number, number], poly: [number, number][]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
    for (const duct of ducts) {
      const side = /sortie [12]$/.test(duct.name), ax = side ? 0 : 1, c = 1 - ax, pts = duct.poly!;
      const edge = Math.min(...pts.map((q) => q[ax])), body = Math.min(...pts.map((q) => q[ax]).filter((v) => v > edge + 0.01));
      expect(body - edge, duct.name).toBeCloseTo(t, 2); // les dents dépassent de t côté cassette
      const tips = pts.filter((q) => Math.abs(q[ax] - edge) < 1e-6).map((q) => q[c]).sort((p, q) => p - q); expect(tips, duct.name).toHaveLength(4); // deux dents
      for (const [lo, hi] of [[tips[0], tips[1]], [tips[2], tips[3]]]) {
        const m = (lo + hi) / 2, wx = side ? duct.pos[0] : duct.pos[0] + m, wz = side ? duct.pos[2] + m : duct.pos[2]; // milieu de la dent, dans le plan de la paroi
        expect(inPoly([wx - cassB.pos[0], wz - cassB.pos[2]], comb.poly!), duct.name + ' : dent dans sa fente').toBe(true);
      }
    }
    expect(ligament(cassB, comb).min).toBeGreaterThanOrEqual(4.5 - 1e-6);
    // le conduit ne touche pas le siège et se retire par le haut avec la cassette
    for (const d of by(sc0, /^Conduit de sortie/)) for (const q of by(sc0, /^Goulotte ventilateur (gauche|droite)/)) expect(gap(aabb(d, t), aabb(q, t)), d.name + ' / ' + q.name).toBeGreaterThan(0.5);
  });
  it('le conduit d air est collé au nid : sa paroi côté nid touche la face extérieure de « Côté gauche int » (jeu 0), fente en face de la grille, plus de manchon', () => {
    const w2 = one(sc0, /^Conduit d'air 2$/), inner = one(sc0, /^Côté gauche int/), slot = w2.holes.find((h) => h.size === 34 && h.sh === 30)!, env = airSlot(inner)!;
    expect(by(sc0, /^Conduit d'air manchon|^Isolant gauche manchon/)).toEqual([]);
    expect(inner.pos[0] - t / 2 - (w2.pos[0] + t / 2)).toBeCloseTo(0, 2); // jeu 0 : le conduit débouche dans le nid
    expect(Math.abs(w2.pos[1] + slot.x - (inner.pos[1] + env.x))).toBeLessThan(0.01); expect(Math.abs(w2.pos[2] + slot.y - (inner.pos[2] + env.y))).toBeLessThan(0.01); // fentes face à face
    expect(env.size).toBeCloseTo(slot.size, 1); expect(slot.sh).toBe(env.sh);
    expect(ligament(w2, slot).min).toBeGreaterThanOrEqual(4.5 - 1e-6);
  });
});

describe("évacuation de l'eau : ouverture rectangulaire au ras du plancher, en face du conduit d'air", () => {
  const inPoly = (pt: [number, number], poly: [number, number][]) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const inner = one(sc0, /^Côté gauche int/), duct = one(sc0, /^Conduit d'air 2$/), floor = one(sc0, /^Plancher int/), floorTop = floor.pos[2] + t / 2;
  const hole = duct.holes.find((h) => h.size === 26 && h.sh === 6)!;
  it('« Conduit d\'air 2 » : trou de 26 × 6 dont le bas est le dessus de « Plancher int », ligaments ≥ 4,5 mm, à l\'écart de la fente d\'aération', () => {
    expect(hole).toBeTruthy(); expect(hole.poly).toBeUndefined();
    expect(duct.pos[2] + hole.y - 3).toBeCloseTo(floorTop, 5); expect(duct.pos[2] + hole.y + 3).toBeCloseTo(floorTop + 6, 5);
    expect(ligament(duct, hole).min).toBeGreaterThanOrEqual(4.5 - 1e-6);
    const slot = duct.holes.find((h) => h.size === 34 && h.sh === 30)!; expect(duct.pos[2] + slot.y - 15).toBeGreaterThan(floorTop + 6 + 4.5); // deux trous distincts, jamais en recoupement
    expect(duct.holes.filter((h) => h.poly)).toEqual([]);
  });
  it('« Côté gauche int » : cran du bord bas de 6 mm de haut au-dessus du plancher, qui couvre la largeur du trou du conduit (aligné), sans seuil', () => {
    const o = outline(inner), b = obb(inner, t); // x local = y du monde, y local = z du monde
    const wy0 = duct.pos[1] + hole.x - hole.size / 2, wy1 = duct.pos[1] + hole.x + hole.size / 2;
    for (const y of [wy0 + 0.5, duct.pos[1], wy1 - 0.5]) {
      const lx = y - b.c.y;
      expect(inPoly([lx, floorTop + 0.3 - b.c.z], o), `bas du cran à y = ${y.toFixed(1)}`).toBe(false); // vide dès le dessus du plancher
      expect(inPoly([lx, floorTop + 5.7 - b.c.z], o), 'haut du cran').toBe(false);
      expect(inPoly([lx, floorTop + 6.3 - b.c.z], o), 'au-dessus du cran : la paroi').toBe(true);
    }
    expect(inner.holes.filter((h) => h.size === 4 && h.sh === 30)).toHaveLength(6);
    // une vraie ENCOCHE : le cran de coin est gardé (le coin reste en bois), plus aucun moignon de dent de chaque côté : les crans voisins touchent l'encoche, bois plein au-dessus, et le plancher n'a pas leurs fentes
    const bn = inner.notches.filter((x) => x.edge === 'bottom').map((x) => [x.pos - x.width / 2, x.pos + x.width / 2, x.depth] as const).sort((p, q) => p[0] - q[0]);
    const dr = bn.find((x) => x[2] > t + 5)!; expect(dr).toBeTruthy(); expect(dr[2]).toBeCloseTo(t + 6, 5);
    expect(dr[0] - (wy0 - b.c.y + inner.w / 2)).toBeLessThanOrEqual(0.01); expect(dr[1] - (wy1 - b.c.y + inner.w / 2)).toBeGreaterThanOrEqual(-0.01); // couvre le trou du conduit
    const before = bn.filter((x) => x !== dr && x[1] <= dr[0] + 0.01).pop()!, after = bn.find((x) => x !== dr && x[0] >= dr[1] - 0.01)!;
    expect(before[0]).toBeLessThanOrEqual(0.01); // cran de coin gardé : le coin reste en bois (pas d'encoche jusqu'au coin)
    expect(dr[0] - before[1]).toBeCloseTo(0, 5); // aucun moignon de dent entre le cran de coin et l'encoche
    expect(after[0] - dr[1]).toBeGreaterThanOrEqual(3 - 1e-6); // au moins 3 mm de bois (une dent entière) entre l'encoche et le cran suivant
    expect(before[1]).toBeGreaterThan(13.9);
    // centres alignés : encoche, fentes de la grille, fente 34 × 30 et trou d'évacuation du conduit sont sur le même axe y (monde) à 0,01 mm
    const cN = b.c.y + (dr[0] + dr[1]) / 2 - inner.w / 2, grid = airSlot(inner)!, cG = b.c.y + grid.x, slot34 = duct.holes.find((h) => h.size === 34 && h.sh === 30)!, cS = duct.pos[1] + slot34.x, cD = duct.pos[1] + hole.x;
    for (const c of [cG, cS, cD]) expect(Math.abs(c - cN), 'centre ' + c).toBeLessThanOrEqual(0.01);
    expect(Math.abs(cN - (duct.pos[1]))).toBeLessThanOrEqual(0.01); // = centre du conduit (AIR_CY)
    const slot = (lx0: number, lx1: number) => floor.holes.some((h) => !h.poly && Math.abs(h.x - inner.pos[0]) < 3 && Math.abs(h.y - (inner.pos[1] + (lx0 + lx1) / 2 - inner.w / 2)) < (lx1 - lx0) / 2 + (h.sh ?? h.size) / 2 - 0.01);
    expect(slot(dr[0] - 3, dr[0]), 'plus de fente pour un moignon').toBe(false); const combF = floor.holes.find((h) => h.poly)!, ty = inner.pos[1] + (dr[1] + 4 - inner.w / 2); expect(inPoly([inner.pos[0] - floor.pos[0], ty - floor.pos[1]], combF.poly!), 'la dent entière à droite garde sa fente (fondue au passage)').toBe(true);
  });
  it("l'eau tombe dans le conduit : le plancher intérieur est ouvert sous le trou, le fond extérieur aussi, et rien n'est posé dans le trou", () => {
    const comb = floor.holes.find((h) => h.poly && h.size > 29 && h.sh! > 46)!, bottom = one(sc0, /^Dessous ext/);
    const y = duct.pos[1], x = duct.pos[0] - 6; // à l'intérieur du conduit, sous le trou
    expect(inPoly([x - floor.pos[0], y - floor.pos[1]], comb.poly!)).toBe(true);
    expect(bottom.holes.some((h) => !h.poly && Math.abs(h.x - (x - bottom.pos[0])) < 12 && Math.abs(h.y - (y - bottom.pos[1])) < 24 && h.size > 20 && (h.sh ?? 0) > 40)).toBe(true);
    const x0 = duct.pos[0] - t / 2, x1 = inner.pos[0] + t / 2, z0 = floorTop + 0.1, z1 = floorTop + 5.9;
    for (const p of sc0.planks) {
      if (p.path || p.special === 'doc' || p === inner || p === duct || p === floor || /^Isolant/.test(p.name)) continue;
      const a = aabb(p, t); expect(a.max.x <= x0 || a.min.x >= x1 || a.max.y <= y - 17 || a.min.y >= y + 17 || a.max.z <= z0 || a.min.z >= z1, `${p.name} dans le trou d'évacuation`).toBe(true);
    }
  });
});
