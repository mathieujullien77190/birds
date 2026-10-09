import { BufferGeometry, ExtrudeGeometry, Shape } from 'three';

/**
 * Queue : éventail court en coin, racine à l'origine, part vers −Z.
 * Longueur 0.4, largeur 0.1 à la racine et 0.3 au bout, épaisseur 0.05.
 */
export function tailGeometry(detail: number): BufferGeometry {
  const L = Math.max(1, Math.round(detail)); // borné par DETAIL_MAX dans shapeGeometry()
  const len = 0.4, w0 = 0.05, w1 = 0.15;
  const s = new Shape();
  s.moveTo(-w0, 0);
  s.lineTo(w0, 0);
  s.lineTo(w1, len * 0.85);
  s.absarc(0, len * 0.85, w1, 0, Math.PI, false); // bout arrondi (rayon w1 → longueur ≈ len)
  s.lineTo(-w0, 0);
  const g = new ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false, curveSegments: 1 + L });
  g.rotateX(-Math.PI / 2); // +Y du profil → −Z ; l'épaisseur extrudée (+Z) → +Y
  g.translate(0, -0.025, 0);
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}
