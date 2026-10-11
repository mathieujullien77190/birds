import { BoxGeometry, Color, CylinderGeometry } from 'three';
import type { Plank } from '../../../model';
import { PALETTE } from '../../registry/palette';
import { coloredPart, type Part, type PartGeometry } from '../geometry';

/** Carte caméra : circuit vert, connecteur de nappe, embase et objectif (objectif vers −z).
 *  Avec `p.wood` (épaisseur de bois traversée) : la carte s'appuie sur le bois, l'embase et l'objectif (cylindres) traversent le trou et le bout de l'objectif affleure l'autre face. */
export function cameraBoardGeometry(p: Plank): PartGeometry {
  const parts: Part[] = [];
  const pcb = new BoxGeometry(p.w, p.h, 1.6);
  parts.push({ g: pcb, c: new Color(PALETTE.pcbGreen) });
  const con = new BoxGeometry(17, 5.5, 2.6); con.translate(0, p.h / 2 - 4.5, 2.1);
  parts.push({ g: con, c: new Color(PALETTE.connectorGray) });
  if (p.wood === undefined) {
    const lensBase = new BoxGeometry(8.5, 8.5, 3); lensBase.translate(0, 0, -2.3);
    parts.push({ g: lensBase, c: new Color(PALETTE.lensBase) });
    const lens = new CylinderGeometry(4, 4, 6, 24); lens.rotateX(Math.PI / 2); lens.translate(0, 0, -6.8);
    parts.push({ g: lens, c: new Color(PALETTE.lens) });
  } else {
    const w = p.wood, hb = w * 0.6, hl = w - hb;
    const base = new CylinderGeometry(4.25, 4.25, hb, 24); base.rotateX(Math.PI / 2); base.translate(0, 0, -(0.8 + hb / 2));
    parts.push({ g: base, c: new Color(PALETTE.lensBase) });
    const lens = new CylinderGeometry(3.7, 3.7, hl, 24); lens.rotateX(Math.PI / 2); lens.translate(0, 0, -(0.8 + hb + hl / 2));
    parts.push({ g: lens, c: new Color(PALETTE.lens) });
  }
  return coloredPart(parts);
}
