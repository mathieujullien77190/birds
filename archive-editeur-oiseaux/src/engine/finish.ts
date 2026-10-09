import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import { albaTone, hashPos } from './palette';

/**
 * Habille une géométrie non indexée : une couleur par face (teinte Alba + légère
 * variation déterministe) et des normales plates ou lissées.
 * Modifie la géométrie en place et la renvoie.
 */
export function finishGeometry(geo: BufferGeometry, hex: string, smooth: boolean, seed = 0): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let t = 0; t < p.count; t += 3) {
    const cx = (p.getX(t) + p.getX(t + 1) + p.getX(t + 2)) / 3;
    const cy = (p.getY(t) + p.getY(t + 1) + p.getY(t + 2)) / 3;
    const cz = (p.getZ(t) + p.getZ(t + 1) + p.getZ(t + 2)) / 3;
    const dl = (hashPos(cx * 40, cy * 40, cz * 40, seed) - 0.5) * 0.06; // facettes très légèrement différentes
    const c = albaTone(hex, dl);
    for (let k = 0; k < 3; k++) {
      col[(t + k) * 3] = c.r;
      col[(t + k) * 3 + 1] = c.g;
      col[(t + k) * 3 + 2] = c.b;
    }
  }
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.computeVertexNormals(); // plates (sommets non partagés)
  if (smooth) averageNormals(g);
  return g;
}

/** Moyenne les normales des sommets confondus : rendu arrondi tout en gardant une couleur par face. */
function averageNormals(g: BufferGeometry): void {
  const p = g.attributes.position, n = g.attributes.normal;
  const sum = new Map<string, [number, number, number]>();
  const key = (i: number) => `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
  for (let i = 0; i < p.count; i++) {
    const k = key(i);
    const a = sum.get(k) ?? [0, 0, 0];
    a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i);
    sum.set(k, a);
  }
  const v = new Vector3();
  for (let i = 0; i < p.count; i++) {
    const a = sum.get(key(i))!;
    v.set(a[0], a[1], a[2]).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  n.needsUpdate = true;
}
