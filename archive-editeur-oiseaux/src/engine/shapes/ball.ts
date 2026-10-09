import { BufferGeometry, IcosahedronGeometry } from 'three';

/** Boule : sphère de rayon 0.3, à étirer librement. */
export function ballGeometry(detail: number): BufferGeometry {
  const L = Math.max(1, Math.round(detail)); // borné par DETAIL_MAX dans shapeGeometry()
  const g = new IcosahedronGeometry(0.3, L);
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}
