import { BoxGeometry, Color, CylinderGeometry } from 'three';
import { PALETTE } from '../../registry/palette';
import { mergeColored, edgesOf, type Part, type PartGeometry } from '../geometry';
import type { Plank } from '../../../model';

/** Ventilateur 40 : cadre noir, rotor gris à pales, moyeu. */
export function fanGeometry(p: Plank): PartGeometry {
  const parts: Part[] = [], d = p.depth ?? 10;
  parts.push({ g: new BoxGeometry(p.w, p.h, d), c: new Color(PALETTE.slate) });
  const rotor = new CylinderGeometry(p.w * 0.44, p.w * 0.44, d + 0.4, 28); rotor.rotateX(Math.PI / 2); parts.push({ g: rotor, c: new Color(PALETTE.slate600) });
  for (let i = 0; i < 7; i++) { const blade = new BoxGeometry(p.w * 0.36, 2.2, d + 0.8); blade.translate(p.w * 0.2, 0, 0); blade.rotateZ((i * 2 * Math.PI) / 7); parts.push({ g: blade, c: new Color(PALETTE.gray500) }); }
  const hub = new CylinderGeometry(p.w * 0.14, p.w * 0.14, d + 1.2, 20); hub.rotateX(Math.PI / 2); parts.push({ g: hub, c: new Color(PALETTE.darkNavy) });
  const geo = mergeColored(parts);
  return { geo, edges: edgesOf(geo) };
}
