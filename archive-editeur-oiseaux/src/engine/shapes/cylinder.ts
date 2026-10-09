import { BufferGeometry, CylinderGeometry } from 'three';

/** Cylindre : rayon 0.2, hauteur 0.6, debout, centré à mi-hauteur. */
export function cylinderGeometry(detail: number): BufferGeometry {
  const L = Math.max(1, Math.round(detail)); // borné par DETAIL_MAX dans shapeGeometry()
  const g = new CylinderGeometry(0.2, 0.2, 0.6, 4 + 2 * L, 1 + Math.floor(L / 2)); // 6 à 28 côtés
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}
