import { BoxGeometry, Color, CylinderGeometry, ExtrudeGeometry, Path, Shape } from 'three';
import { PALETTE } from '../../registry/palette';
import { mergeColored, edgesOf, type Part, type PartGeometry } from '../geometry';
import type { Plank } from '../../../model';

/** Ventilateur carré (Noctua NF-A6x25 : 60 × 60 × 25) : cadre percé d'un alésage rond (statique) et rotor à 9 pales avec son moyeu (maillage à part, qui tourne). L'axe du rotor est z ; couleur du cadre = `p.color` (brun du Noctua par défaut). À l'arrêt, cadre + rotor redonnent exactement l'ancien dessin d'un seul bloc. */
export function fanGeometry(p: Plank): PartGeometry {
  const parts: Part[] = [], rotorParts: Part[] = [], d = p.depth ?? 25, w = p.w, bore = w * 0.46;
  const shape = new Shape();
  shape.moveTo(-w / 2, -p.h / 2); shape.lineTo(w / 2, -p.h / 2); shape.lineTo(w / 2, p.h / 2); shape.lineTo(-w / 2, p.h / 2); shape.closePath();
  const hole = new Path(); hole.absarc(0, 0, bore, 0, Math.PI * 2, true); shape.holes.push(hole);
  const frame = new ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, curveSegments: 32 }); frame.translate(0, 0, -d / 2);
  parts.push({ g: frame, c: new Color(p.color ?? PALETTE.slate) });
  for (let i = 0; i < 9; i++) { const blade = new BoxGeometry(bore * 0.78, 2.4, d * 0.8); blade.translate(bore * 0.5, 0, 0); blade.rotateZ((i * 2 * Math.PI) / 9); rotorParts.push({ g: blade, c: new Color(PALETTE.lightGray) }); }
  const hub = new CylinderGeometry(w * 0.15, w * 0.15, d * 0.9, 24); hub.rotateX(Math.PI / 2); rotorParts.push({ g: hub, c: new Color(PALETTE.slate600) });
  const geo = mergeColored(parts), rotor = mergeColored(rotorParts);
  return { geo, edges: edgesOf(geo), rotor: { geo: rotor, edges: edgesOf(rotor) } };
}
