import { BufferGeometry, IcosahedronGeometry } from 'three';

/** Tête : sphère légèrement allongée vers l'avant (+Z), rayon 0.28. */
export function headGeometry(detail: number): BufferGeometry {
  const L = Math.max(1, Math.round(detail)); // borné par DETAIL_MAX dans shapeGeometry()
  const g = new IcosahedronGeometry(0.28, L);
  g.scale(1, 0.96, 1.12);
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}
