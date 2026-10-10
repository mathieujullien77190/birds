import { BufferGeometry, ConeGeometry } from 'three';

/** Cône : rayon 0.25, hauteur 0.6, pointe vers le haut, centré à mi-hauteur. */
export function coneGeometry(detail: number): BufferGeometry {
  const L = Math.max(1, Math.round(detail)); // borné par DETAIL_MAX dans shapeGeometry()
  const g = new ConeGeometry(0.25, 0.6, 4 + 2 * L, 1 + Math.floor(L / 2)); // 6 à 28 côtés
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}
