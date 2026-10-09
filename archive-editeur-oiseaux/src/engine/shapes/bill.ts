import { BufferGeometry, ExtrudeGeometry, Shape } from 'three';

/**
 * Bec de colvert (style Alba) : large et triangulaire à la base (presque aussi large que la tête),
 * plat, qui s'affine vers un bout arrondi ; épais à la racine, fin au bout, légèrement courbé vers le bas.
 * Racine à l'origine, part vers +Z (repère three.js ; avant +Y dans l'app après toAppFrame).
 * Longueur 0.3, largeur 0.26 à la racine, 0.14 au bout, épaisseur 0.1 → 0.035.
 */
export function billGeometry(detail: number): BufferGeometry {
  const L = Math.max(1, Math.round(detail)); // borné par DETAIL_MAX dans shapeGeometry()
  const len = 0.3, w0 = 0.13, w1 = 0.07;
  const s = new Shape();
  s.moveTo(-w0, 0);
  s.lineTo(w0, 0);
  s.lineTo(w1, len - w1);
  s.absarc(0, len - w1, w1, 0, Math.PI, false); // bout arrondi
  s.lineTo(-w0, 0);
  const g = new ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: false, curveSegments: 2 + L * 2 });
  // le profil est dessiné dans le plan X-Y (Y = longueur) : on le couche pour que la longueur soit en +Z, l'épaisseur en Y
  g.rotateX(Math.PI / 2); // +Y du profil → +Z ; l'épaisseur extrudée (+Z) → −Y
  g.translate(0, 0.05, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), z = p.getZ(i);
    const t = Math.max(0, Math.min(1, z / len));
    const thick = 1 - 0.65 * t; // épais à la racine, fin au bout
    const ridge = y > 0 ? 0.015 * Math.sin(t * Math.PI) : 0; // dessus légèrement bombé (arête du bec)
    const droop = -0.03 * t * t; // le bout plonge un peu
    p.setY(i, y * thick + ridge + droop);
  }
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}
