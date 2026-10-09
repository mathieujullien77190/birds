import { BufferGeometry, CylinderGeometry } from 'three';

/** Cylindre couché : rayon 0.2, longueur 0.6, axe sur X (ses deux faces plates regardent vers +X et −X). */
export function cylinderXGeometry(detail: number): BufferGeometry {
  const L = Math.max(1, Math.round(detail)); // borné par DETAIL_MAX dans shapeGeometry()
  const g = new CylinderGeometry(0.2, 0.2, 0.6, 4 + 2 * L, 1 + Math.floor(L / 2)); // 6 à 28 côtés
  g.rotateZ(Math.PI / 2); // l'axe Y du cylindre passe sur X
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}
