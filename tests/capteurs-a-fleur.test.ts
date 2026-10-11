import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { Plank } from '@/birdhouse/model';
import { cameraBoardGeometry } from '@/birdhouse/three/factories/part/camera';
import { irBoardGeometry } from '@/birdhouse/three/factories/part/ir';
import { sensorGeometry } from '@/birdhouse/three/factories/part/sensor';
import { buildNest } from './helpers';
import { obb } from './geomChecks';

/** Caméras, LED infrarouges et puce du capteur : le bout de leur corps affleure la face extérieure du bois (± 0,5 mm), ne la dépasse pas de plus de 0,5 mm,
 *  traverse son trou avec ≥ 0,3 mm de jeu, et la carte s'appuie sur l'autre face. */
const sc = buildNest({}), t = sc.t;
const find = (re: RegExp) => sc.planks.find((p) => re.test(p.name))!;
const geoOf = (p: Plank) => (p.special === 'camera' ? cameraBoardGeometry(p) : p.special === 'ir' ? irBoardGeometry(p) : sensorGeometry(p)).geo;

interface Item { name: string; el: Plank; host: Plank; out: Vector3; body: (z: number) => boolean }
const roofOut = new Vector3(0, 0, -1);
const boxCenter = (() => { const ps = sc.planks.filter((p) => /^Boîte caméra 2/.test(p.name)); return ps.reduce((s, p) => s.add(new Vector3(...p.pos)), new Vector3()).divideScalar(ps.length); })();
const front = find(/^Boîte caméra 2 : face avant/);
const frontOut = (() => { const n = obb(front, t).ax[2].clone(); return n.dot(new Vector3(...front.pos).sub(boxCenter)) >= 0 ? n : n.negate(); })();
const below = (z: number) => z < -0.8 - 1e-6, above = (z: number) => z > 0.8 + 1e-6;
const items: Item[] = [
  { name: 'caméra 1', el: find(/^Caméra$/), host: find(/^Dessous toit/), out: roofOut, body: below },
  { name: 'LED infrarouges (nid)', el: find(/^LED infrarouges$/), host: find(/^Dessous toit/), out: roofOut, body: below },
  { name: 'capteur BME280', el: find(/^Capteur/), host: find(/^Dessous toit/), out: roofOut, body: above },
  { name: 'caméra 2', el: find(/^Caméra 2$/), host: front, out: frontOut, body: below },
  { name: 'LED infrarouges extérieures', el: find(/^LED infrarouges extérieures/), host: front, out: frontOut, body: below },
];

function measure(it: Item) {
  const b = obb(it.el, t), h = obb(it.host, t), g = geoOf(it.el), pos = g.attributes.position;
  const verts: Vector3[] = [];
  for (let i = 0; i < pos.count; i++) if (it.body(pos.getZ(i))) verts.push(b.c.clone().addScaledVector(b.ax[0], pos.getX(i)).addScaledVector(b.ax[1], pos.getY(i)).addScaledVector(b.ax[2], pos.getZ(i)));
  expect(verts.length, it.name + ' : corps').toBeGreaterThan(0);
  const outerD = new Vector3(...it.host.pos).dot(it.out) + (it.host.depth ?? t) / 2; // plan de la face extérieure du bois
  const tip = Math.max(...verts.map((v) => v.dot(it.out))) - outerD; // > 0 : dépasse
  const cen = verts.reduce((s, v) => s.add(v), new Vector3()).divideScalar(verts.length);
  const loc = (v: Vector3) => { const d = v.clone().sub(h.c); return [d.dot(h.ax[0]), d.dot(h.ax[1])]; };
  const [cx, cy] = loc(cen);
  const hole = it.host.holes.filter((x) => Math.hypot(x.x - cx, x.y - cy) < 4).sort((p, q) => Math.hypot(p.x - cx, p.y - cy) - Math.hypot(q.x - cx, q.y - cy))[0];
  expect(hole, it.name + ' : trou').toBeDefined();
  let clearance = 1e9;
  for (const v of verts) {
    const [x, y] = loc(v);
    clearance = Math.min(clearance, hole.shape === 'round' ? hole.size / 2 - Math.hypot(x - hole.x, y - hole.y) : Math.min(hole.size / 2 - Math.abs(x - hole.x), (hole.sh ?? hole.size) / 2 - Math.abs(y - hole.y)));
  }
  // la carte s'appuie contre la face intérieure du bois : écart entre cette face et la face de la carte tournée vers le bois (la carte fait 1,6 mm d'épaisseur)
  const innerD = outerD - (it.host.depth ?? t), cardFace = new Vector3(...it.el.pos).dot(it.out) + 0.8;
  if (process.env.SHOW_FLUSH) console.log(`${it.name} : bout ${tip.toFixed(2)} mm, jeu ${clearance.toFixed(2)} mm, carte à ${(innerD - cardFace).toFixed(2)} mm du bois`);
  return { tip, clearance, gap: innerD - cardFace };
}

describe('capteurs et caméras à fleur du bois', () => {
  for (const it of items) {
    it_(it, measure(it));
  }
});
function it_(i: Item, m: ReturnType<typeof measure>) {
  it(`${i.name} : bout à fleur de la face extérieure (± 0,5 mm), jamais enfoncé`, () => { expect(Math.abs(m.tip), `bout à ${m.tip.toFixed(2)} mm`).toBeLessThanOrEqual(0.5); });
  it(`${i.name} : traverse son trou avec ≥ 0,3 mm de jeu`, () => { expect(m.clearance, `jeu ${m.clearance.toFixed(2)}`).toBeGreaterThanOrEqual(0.3); });
  it(`${i.name} : la carte reste côté intérieur, appuyée contre le bois`, () => {
    expect(m.gap, `carte à ${m.gap.toFixed(2)} mm du bois`).toBeGreaterThanOrEqual(-0.05); // jamais dans le bois
    expect(m.gap, `carte à ${m.gap.toFixed(2)} mm du bois`).toBeLessThanOrEqual(0.3); // appuyée, sans flottement
  });
}
