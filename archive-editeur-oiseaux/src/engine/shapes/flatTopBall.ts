import { BufferGeometry, IcosahedronGeometry } from 'three';

/**
 * Boule aplatie sur le haut : sphère de rayon 0.3 dont la moitié supérieure est écrasée en un dôme
 * à sommet plat (comme la tête du colvert). La moitié inférieure reste ronde.
 */
export function flatTopBallGeometry(detail: number): BufferGeometry {
  const L = Math.max(1, Math.round(detail)); // borné par DETAIL_MAX dans shapeGeometry()
  const R = 0.3;
  const g = new IcosahedronGeometry(R, L);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y <= 0) continue;
    const t = Math.min(1, y / R); // 0 à l'équateur, 1 au pôle
    p.setY(i, R * 0.8 * (1 - Math.pow(1 - t, 1.6))); // monte vite puis s'aplatit : plateau au sommet à 0.8 R
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}
