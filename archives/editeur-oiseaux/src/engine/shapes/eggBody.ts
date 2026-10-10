import { BufferGeometry, IcosahedronGeometry } from 'three';

/**
 * Corps de canard : un œuf couché à l'horizontale.
 * Icosaèdre subdivisé, allongé sur Z (l'avant de l'oiseau = +Z) ; le gros bout est devant
 * (la poitrine), le bout fin derrière (vers la queue). Rayon de base 0.5, longueur ≈ 1.6.
 */
export function eggBodyGeometry(detail: number): BufferGeometry {
  const L = Math.max(1, Math.round(detail)); // borné par DETAIL_MAX dans shapeGeometry()
  const g = new IcosahedronGeometry(0.5, L); // non indexé : chaque face a ses propres sommets
  const p = g.attributes.position;
  const R = 0.5;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = Math.max(-1, Math.min(1, z / R)); // −1 à l'arrière, +1 à l'avant
    const egg = 1 + 0.16 * t - 0.1 * t * t; // section plus large vers l'avant, plus étroite vers l'arrière
    const belly = 1 + 0.06 * Math.max(0, -y / R); // ventre un peu plus large que le dos
    p.setXYZ(i, x * egg * belly, y * egg * 0.94, z * 1.6);
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}
