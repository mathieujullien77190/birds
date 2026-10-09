import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import type { Vec3 } from '../types';

/**
 * Pyramide à base carrée dont les 5 coins sont libres (repère de l'app : X droite, Y avant, Z haut).
 * Points 0..3 = base (dans l'ordre autour du carré), point 4 = sommet.
 * Par défaut : base verticale à y = 0 (racine, côté tête), sommet devant à y = +0.4 : un bec.
 */
export const PYRAMID_DEFAULT_POINTS: Vec3[] = [
  [-0.13, 0, 0.05], // base : arrière-gauche-haut
  [0.13, 0, 0.05], // arrière-droite-haut
  [0.13, 0, -0.05], // arrière-droite-bas
  [-0.13, 0, -0.05], // arrière-gauche-bas
  [0, 0.4, 0], // sommet, vers l'avant
];

/** Géométrie à partir des 5 coins : 4 faces triangulaires + base en 2 triangles, normales vers l'extérieur. */
export function pyramidGeometry(points: Vec3[] = PYRAMID_DEFAULT_POINTS): BufferGeometry {
  const P = points.map((p) => new Vector3(...p));
  const center = P.reduce((a, p) => a.add(p), new Vector3()).multiplyScalar(1 / P.length);
  const tris: Vector3[][] = [];
  const add = (a: Vector3, b: Vector3, c: Vector3) => { // orienté vers l'extérieur (loin du centre)
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    const mid = a.clone().add(b).add(c).multiplyScalar(1 / 3).sub(center);
    tris.push(n.dot(mid) >= 0 ? [a, b, c] : [a, c, b]);
  };
  for (let i = 0; i < 4; i++) add(P[i], P[(i + 1) % 4], P[4]); // faces
  add(P[0], P[1], P[2]); add(P[0], P[2], P[3]); // base
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(tris.flatMap((t) => t.flatMap((v) => [v.x, v.y, v.z])), 3));
  g.computeVertexNormals();
  return g;
}
