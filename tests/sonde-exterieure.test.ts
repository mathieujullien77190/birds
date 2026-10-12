import { describe, expect, it } from 'vitest';
import { PI_PIN_X0, PI_PIN_Y, type Plank } from '@/birdhouse/model';
import { buildNest, VARIANTS } from './helpers';
import { obb, pathItems } from './geomChecks';
import { materialAt } from './wireChecks';

/** Sonde de température extérieure DS18B20 : collée sous le débord du pan en okoumé (côté gauche, y ≈ +40), câble par un trou Ø 5 de la lame d'habillage et de la plaque gauche du toit,
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

  it('le câble traverse la lame d\'habillage et la plaque gauche du toit par leur trou de 5 mm, sous la baguette du couvercle', () => {
    const side = find(/^Côté gauche toit/), lam = all(/^Lambris gauche/).find((p) => Math.abs(p.pos[1] - probe.pos[1]) < p.w / 2)!;
    for (const plate of [side, lam]) expect(plate.holes.filter((h) => h.shape === 'round' && h.size === 5), plate.name).toHaveLength(1);
    const pts = pathItems([cable])[0].pts;
    const xs = [-W / 2 - 4.9, -W / 2 - 2.5, -W / 2 - 0.1], xt = [-W / 2 + 0.1, -W / 2 + t / 2, -W / 2 + t - 0.1];
    for (const [plate, list] of [[lam, xs], [side, xt]] as [Plank, number[]][]) {
      for (const x of list) {
        const i = pts.findIndex((q, k) => k > 0 && (pts[k - 1].x - x) * (q.x - x) <= 0), a = pts[i - 1], b = pts[i];
        const q = a.clone().lerp(b, (x - a.x) / (b.x - a.x));
        expect(materialAt(plate, q, t, 0), `${plate.name} à x = ${x.toFixed(1)}`).toBe(false); // dans le trou
        const hole = plate.holes.find((h) => h.size === 5)!, pb = obb(plate, t), d = q.clone().sub(pb.c);
        expect(Math.hypot(d.dot(pb.ax[0]) - hole.x, d.dot(pb.ax[1]) - hole.y)).toBeLessThan(hole.size / 2 - 1.45 + 1e-6); // le câble (Ø 2,9) tient dans le trou
      }
    }
    const strip = find(/^Baguette couvercle gauche/), sb = obb(strip, t);
    for (const q of pts) expect(Math.abs(q.clone().sub(sb.c).dot(sb.ax[0])) < sb.h[0] && Math.abs(q.clone().sub(sb.c).dot(sb.ax[1])) < sb.h[1] && Math.abs(q.clone().sub(sb.c).dot(sb.ax[2])) < sb.h[2] + 1.45, 'le câble ne touche pas la baguette').toBe(false);
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
