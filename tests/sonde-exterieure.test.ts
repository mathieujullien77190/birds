import { describe, expect, it } from 'vitest';
import { PI_PIN_X0, PI_PIN_Y } from '@/birdhouse/model';
import { buildNest, VARIANTS } from './helpers';
import { obb, pathItems } from './geomChecks';
import { crossings } from './wireChecks';
import { ligament } from './geomLigament';

/** Sonde de température extérieure DS18B20 : collée sous le débord du pan en okoumé (côté gauche, y ≈ +40), câble par un canal oblong de 8 mm du toit (plaque crénelée fermée par la plaque pleine),
 *  module 3 broches près du Pi, trois cordons Dupont vers les broches 17 (3,3 V), 7 (GPIO4) et 20 (masse). */
describe.each(Object.entries(VARIANTS))('sonde extérieure (%s)', (_nom, over) => {
  const sc = buildNest(over), t = sc.t;
  const find = (re: RegExp) => sc.planks.find((p) => re.test(p.name))!;
  const all = (re: RegExp) => sc.planks.filter((p) => re.test(p.name));
  const probe = find(/^Sonde de température extérieure/), cable = find(/^Câble sonde extérieure/), mod = find(/^Module DS18B20/);
  const W = find(/^Face avant ext/).w, D = find(/^Côté gauche ext/).w;
  const pan = find(/^Toit en okoumé \(plaque crénelée\)/);

  it('une seule sonde, un module, un câble et trois fils vers le Pi', () => {
    expect(all(/^Sonde de température extérieure/)).toHaveLength(1);
    expect(all(/^Module DS18B20/)).toHaveLength(1);
    expect(all(/^Câble sonde extérieure/)).toHaveLength(1);
    expect(all(/^Fil sonde /).map((p) => p.name).sort()).toEqual(['Fil sonde 3,3 V (rouge)', 'Fil sonde DATA (jaune)', 'Fil sonde masse (noir)']);
    expect(probe.url).toBeUndefined(); // pas de lien inventé
  });

  it('sous le débord gauche du pan, à y ≈ +40, loin de la caméra 2, du ventilateur et du régulateur', () => {
    const [x, y] = probe.pos;
    expect(x).toBeLessThan(-W / 2 - 5); // dehors, au-delà de l'habillage
    expect(x).toBeGreaterThan(-W / 2 - 30); // sous le débord de 30 mm
    expect(Math.abs(y - 40)).toBeLessThan(D / 12); // milieu de la lame d'habillage qui contient y = +40
    for (const [re, mini] of [[/^Caméra 2$/, 80], [/^Ventilateur Noctua/, 100], [/^Régulateur de charge/, 150]] as [RegExp, number][]) {
      const p = sc.planks.find((q) => re.test(q.name));
      if (!p) continue; // sans la caméra 2
      expect(Math.hypot(p.pos[0] - x, p.pos[1] - y), re.source).toBeGreaterThan(mini);
    }
  });

  it('collée contre le dessous du pan (face haute de la sonde à 0 mm du dessous de la plaque crénelée)', () => {
    const pb = obb(pan, t), sb = obb(probe, t);
    const dz = sb.c.clone().sub(pb.c).dot(pb.ax[2]); // hauteur du centre de la sonde dans le repère du pan
    expect(Math.abs(Math.abs(dz) - ((pan.depth ?? t) / 2 + probe.depth! / 2))).toBeLessThan(0.05);
    expect(dz).toBeLessThan(0); // dessous
  });

  it('le câble passe DANS le toit : canal oblong de 8 mm dans la plaque crénelée, fermé par la plaque pleine ; ni la lame d habillage ni la plaque gauche du toit ne sont percées', () => {
    const side = find(/^Côté gauche toit/), full = find(/^Toit en okoumé \(plaque pleine\)/);
    for (const plate of [side, ...all(/^Lambris gauche/)]) expect(plate.holes.filter((h) => h.shape === 'round' && h.size >= 5), plate.name).toEqual([]);
    expect(full.holes).toEqual([]);
    const chan = pan.holes.filter((h) => h.r !== undefined && h.sh === 8);
    expect(chan).toHaveLength(1); expect(chan[0].r).toBe(4); // bouts ronds, 8 mm de large
    const c = chan[0], pb = obb(pan, t);
    const xa = c.x - c.size / 2, xb = c.x + c.size / 2, ya = c.y - 4, yb = c.y + 4;
    expect(xa).toBeLessThan(probe.pos[0]); expect(xa).toBeGreaterThan(probe.pos[0] - 6); // commence à l'aplomb de la sonde
    const left = find(/^Baguette couvercle gauche/), lb = obb(left, t);
    expect(xb).toBeGreaterThan(lb.c.x + t / 2 + 8); // finit dans le caisson, derrière la baguette gauche
    expect(Math.min(xa + pan.w / 2, pan.w / 2 - xb, ya + pan.h / 2, pan.h / 2 - yb)).toBeGreaterThanOrEqual(3); // bords de la plaque
    expect(ligament(pan, c).min).toBeGreaterThanOrEqual(3 - 1e-6); // ligaments de bois autour du canal (fentes des baguettes, autres canaux, bords)
    // la baguette gauche n'a aucune dent dans le canal + 3 mm de chaque côté : aucune fente de la plaque crénelée à ces ordonnées
    const slotsLeft = pan.holes.filter((h) => h.r === undefined && Math.abs(h.x - lb.c.x) < 2);
    expect(slotsLeft.length).toBeGreaterThan(2);
    for (const h of slotsLeft) expect(h.y + (h.sh ?? 0) / 2 < ya - 3 + 1e-6 || h.y - (h.sh ?? 0) / 2 > yb + 3 - 1e-6, `fente à y = ${h.y}`).toBe(true);
    // le câble : dans le canal quand il est entre les deux plaques, jamais dans la baguette, jamais au-dessus de la plaque crénelée
    const pts = pathItems([cable])[0].pts; let inChannel = 0;
    for (const q of pts) {
      const d = q.clone().sub(pb.c), lx = d.dot(pb.ax[0]), ly = d.dot(pb.ax[1]), lz = d.dot(pb.ax[2]);
      expect(lz, 'sous la plaque pleine').toBeLessThanOrEqual((pan.depth ?? t) / 2 - 1.45 + 0.1);
      if (lz > -(pan.depth ?? t) / 2 + 0.05) { inChannel++; expect(lx > xa - 0.1 && lx < xb + 0.1 && Math.abs(ly - c.y) <= 4 - 1.45 + 0.1, `dans le canal (${lx.toFixed(1)}, ${ly.toFixed(1)})`).toBe(true); }
    }
    expect(inChannel).toBeGreaterThan(20);
  });
  it('le câble ne traverse aucune pièce solide (hors le canal) et reste sous la pente', () => {
    expect(crossings(sc).filter(([w]) => /^Câble sonde/.test(w))).toEqual([]);
    const pts = pathItems([cable])[0].pts, pb = obb(pan, t);
    for (const q of pts) expect(q.clone().sub(pb.c).dot(pb.ax[2]), 'au plus à la mi-épaisseur de la plaque crénelée').toBeLessThanOrEqual(0.1);
    const len = pts.reduce((s, q, i) => (i ? s + q.distanceTo(pts[i - 1]) : 0), 0);
    expect(len / 10, 'longueur du trajet dessiné (cm)').toBeGreaterThan(9); expect(len / 10).toBeLessThan(80);
  });

  it('le module est près du Pi et les trois cordons finissent sur les broches 7, 17 et 20', () => {
    const pi = find(/^Raspberry Pi/);
    expect(Math.hypot(mod.pos[0] - pi.pos[0], mod.pos[1] - pi.pos[1])).toBeLessThan(70);
    const expected = { 'Fil sonde 3,3 V (rouge)': 17, 'Fil sonde DATA (jaune)': 7, 'Fil sonde masse (noir)': 20 } as Record<string, number>;
    for (const [n, pin] of Object.entries(expected)) {
      const idx = Math.floor((pin - 1) / 2), ly = pin % 2 ? PI_PIN_Y - 2.54 : PI_PIN_Y, lx = PI_PIN_X0 + idx * 2.54; // impaires : rangée intérieure, paires : rangée extérieure
      const end = pathItems([sc.planks.find((q) => q.name === n)!])[0].ends[1];
      expect(end.x, `${n} : broche ${pin}`).toBeCloseTo(pi.pos[0] - ly, 1); // le Pi est tourné de 90° : x monde = x du Pi − ly, y monde = y du Pi + lx
      expect(end.y, `${n} : broche ${pin}`).toBeCloseTo(pi.pos[1] + lx, 1);
    }
  });
});
