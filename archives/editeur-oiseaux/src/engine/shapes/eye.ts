import { BufferGeometry, IcosahedronGeometry } from 'three';

/** Œil : petite bille, rayon 0.035. */
export function eyeGeometry(detail: number): BufferGeometry {
  const L = Math.max(1, Math.round(detail)); // borné par DETAIL_MAX dans shapeGeometry()
  const g = new IcosahedronGeometry(0.035, L);
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}
