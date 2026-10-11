import { BufferGeometry, Color, ExtrudeGeometry, Float32BufferAttribute, Path, Shape, Vector2 } from 'three';
import { holeOutline, outline, type Plank } from '../model';
import { cameraGeometry } from './partGeometry';

/** Dessus (face +z de la plaque) clair, dessous un peu plus foncé, tranche (épaisseur) marron foncé : on voit tout de suite le sens et l'épaisseur. */
const TOP = new Color('#e2c79a'), BOTTOM = new Color('#c9a874'), SIDE = new Color('#6f4a22');
export function plankGeometry(p: Plank, t: number): { geo: BufferGeometry; edges: BufferGeometry } {
  if (p.special && p.special !== 'alu') return cameraGeometry(p, t);
  const pts = outline(p);
  const shape = new Shape(pts.map(([x, y]) => new Vector2(x, y)));
  for (const h of p.holes) shape.holes.push(new Path(holeOutline(h).map(([x, y]) => new Vector2(x, y))));
  const geo = new ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
  geo.translate(0, 0, -t / 2);
  // couleur par face d'après la normale : dessus, dessous, tranche
  const nrm = geo.attributes.normal, col = new Float32Array(nrm.count * 3);
  for (let i = 0; i < nrm.count; i++) {
    const z = nrm.getZ(i), c = z > 0.5 ? TOP : z < -0.5 ? BOTTOM : SIDE;
    col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b;
  }
  if (p.special === 'alu') { const c = new Color(p.color ?? '#cbd5e1'); for (let i = 0; i < nrm.count; i++) { const k = nrm.getZ(i) < -0.5 ? 0.9 : Math.abs(nrm.getZ(i)) <= 0.5 ? 0.8 : 1; col[3 * i] = c.r * k; col[3 * i + 1] = c.g * k; col[3 * i + 2] = c.b * k; } } // aluminium : une seule teinte
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  const pos: number[] = [];
  for (const loop of [pts, ...p.holes.map(holeOutline)]) for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    pos.push(a[0], a[1], -t / 2, b[0], b[1], -t / 2, a[0], a[1], t / 2, b[0], b[1], t / 2);
    if (loop.length <= 12) pos.push(a[0], a[1], -t / 2, a[0], a[1], t / 2); // verticales aux angles (pas sur les cercles)
  }
  return { geo, edges: new BufferGeometry().setAttribute('position', new Float32BufferAttribute(pos, 3)) };
}
