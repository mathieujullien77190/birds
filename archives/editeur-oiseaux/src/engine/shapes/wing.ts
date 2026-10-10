import { BufferGeometry, IcosahedronGeometry } from 'three';

/**
 * Aile repliée : ovale plat couché le long du flanc (long en Z, haut en Y, fin en X),
 * pointu vers l'arrière (−Z). Rayon 0.5 avant étirement. Côté droit : placer en +X et cocher « symétrique ».
 */
export function wingGeometry(detail: number): BufferGeometry {
  const L = Math.max(1, Math.round(detail)); // borné par DETAIL_MAX dans shapeGeometry()
  const g = new IcosahedronGeometry(0.5, L);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const back = Math.max(0, -z / 0.5); // 0 à l'avant, 1 à la pointe arrière
    const taper = 1 - 0.55 * back * back; // l'arrière s'effile
    p.setXYZ(i, x * 0.1 * taper, y * 0.42 * taper, z * 1.0);
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}
