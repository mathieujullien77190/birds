import { BoxGeometry, Color, CylinderGeometry } from 'three';
import { IR_LED_HOLES, IR_LED_LEN, IR_LIFT, IR_R_COLS, IR_R_ROWS, IR_SHIM_Y, IR_W, irHole, irLedCenter } from '../../../model';
import type { Plank } from '../../../model';
import { PALETTE } from '../../registry/palette';
import { coloredPart, type Part, type PartGeometry } from '../geometry';

/** Carte de 4 LED infrarouges de 3 mm (2 branches de 2 LED en série) avec ses 2 résistances de 68 Ω ; côté LED vers −z, corps des LED de 5,3 mm sous la carte (la carte, soulevée par deux cales de 3 mm, laisse le bout des LED à 0,7 mm sous le dessous du bois). */
export function irBoardGeometry(p: Plank): PartGeometry {
  const parts: Part[] = [];
  parts.push({ g: new BoxGeometry(p.w, p.h, 1.6), c: new Color(PALETTE.irBoard) });
  for (const [col, row] of IR_LED_HOLES) { // les deux pattes de chaque LED traversent la carte : anode (+, patte longue) dans la rangée `row`, cathode (−, patte courte) dans la suivante
    for (const [r, c] of [[row, PALETTE.irAnode], [row + 1, PALETTE.irCathode]] as const) { const [lx, ly] = irHole(col, r), leg = new BoxGeometry(0.5, 0.5, 2.3); leg.translate(lx, ly, 0.35); parts.push({ g: leg, c: new Color(c) }); }
  }
  for (const h of IR_LED_HOLES) { const [x, y] = irLedCenter(h), led = new CylinderGeometry(1.5, 1.5, IR_LED_LEN, 12); led.rotateX(Math.PI / 2); led.translate(x, y, -(0.8 + IR_LED_LEN / 2)); parts.push({ g: led, c: new Color(PALETTE.irLed) }); }
  for (const col of IR_R_COLS) { // résistance de 68 Ω SOUS la carte (côté bois, 0,7 mm de jeu), corps le long de la colonne, pattes remontant dans les rangées 3 et 6
    const [x, y3] = irHole(col, IR_R_ROWS[0]), [, y6] = irHole(col, IR_R_ROWS[1]), y = (y3 + y6) / 2, r = 1.15, z = -(0.8 + r);
    const body = new CylinderGeometry(r, r, 6.3, 14); body.translate(x, y, z); parts.push({ g: body, c: new Color(PALETTE.resistorBody) });
    ([[-2.2, PALETTE.resistorBlue], [-1.1, PALETTE.resistorGrey], [0, PALETTE.resistorBlack], [2.4, PALETTE.resistorGold]] as const).forEach(([dy, c]) => { const band = new CylinderGeometry(r + 0.05, r + 0.05, 0.6, 14); band.translate(x, y + dy, z); parts.push({ g: band, c: new Color(c) }); });
    for (const yy of [y3, y6]) { const lead = new BoxGeometry(0.5, 0.5, r + 1.6); lead.translate(x, yy, z + (r + 1.6) / 2); parts.push({ g: lead, c: new Color(PALETTE.solder) }); } // patte : du corps jusqu'au-dessus de la carte, où elle est soudée
  }
  for (const yc of IR_SHIM_Y) { const shim = new BoxGeometry(IR_W, 5, IR_LIFT); shim.translate(0, yc, -(0.8 + IR_LIFT / 2)); parts.push({ g: shim, c: new Color(PALETTE.plywoodTop) }); } // les deux cales de 3 mm (morceaux de baguette de 8 mm) sous les deux bouts de la carte
  return coloredPart(parts);
}
