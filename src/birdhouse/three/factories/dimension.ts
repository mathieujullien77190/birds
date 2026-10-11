import { MARK } from '../constants';
import { BufferGeometry, CanvasTexture, Float32BufferAttribute, Group, LineSegments, Sprite, SpriteMaterial, Vector3 } from 'three';
import { PALETTE } from '../registry/palette';
import { materials } from '../registry/materials';

/** Étiquette de mesure flottante : texte dessiné sur un canvas, toujours face à la caméra, au-dessus de tout. */
function measureSprite(text: string): Sprite {
  const cv = document.createElement('canvas');
  cv.width = 320; cv.height = 72;
  const g = cv.getContext('2d')!;
  g.font = '600 34px system-ui, sans-serif';
  const w = g.measureText(text).width + 28;
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.beginPath(); g.roundRect((cv.width - w) / 2, 8, w, 56, 12); g.fill();
  g.strokeStyle = PALETTE.dimExt; g.lineWidth = 2; g.stroke();
  g.fillStyle = PALETTE.dimLine; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, cv.width / 2, 37);
  const sp = new Sprite(new SpriteMaterial({ map: new CanvasTexture(cv), transparent: true })); // testée en profondeur : cachée derrière le bois
  sp.scale.set(60, 13.5, 1);
  sp.renderOrder = MARK.dimensionRenderOrder;
  return sp;
}

// cotes testées en profondeur (matériaux du registre) : on ne voit pas celles qui sont derrière une pièce

/**
 * Une cote : trait de a à b, petites barres aux deux bouts (le long de `tick`), traits de rappel vers l'objet (de a − off et b − off),
 * et la mesure au milieu. Tout en coordonnées du groupe parent.
 */
export function dimension(a: Vector3, b: Vector3, tick: Vector3, off: Vector3, text: string): Group {
  const g = new Group();
  const t = tick.clone().multiplyScalar(4);
  const pos = [a, b, a.clone().sub(t), a.clone().add(t), b.clone().sub(t), b.clone().add(t)].flatMap((p) => [p.x, p.y, p.z]);
  g.add(new LineSegments(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(pos, 3)), materials.dimLine()));
  const ext = [a.clone().sub(off), a, b.clone().sub(off), b].flatMap((p) => [p.x, p.y, p.z]);
  g.add(new LineSegments(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(ext, 3)), materials.dimExtension()));
  const sp = measureSprite(text);
  sp.position.copy(a).add(b).multiplyScalar(0.5).add(tick.clone().multiplyScalar(9));
  g.add(sp);
  return g;
}
