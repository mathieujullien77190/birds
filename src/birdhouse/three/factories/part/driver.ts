import { BoxGeometry, Color } from 'three';
import { PALETTE } from '../../registry/palette';
import { mergeColored, edgesOf, type Part, type PartGeometry } from '../geometry';
import type { Plank } from '../../../model';

const BOARD_H = 17, GAP = 2;

/** Modules MOSFET LR7843 (cartes plates de 23 × 17 mm, sans bornier : les fils se soudent dans les trous) : autant de cartes que `p.h` en contient, rangées le long de y ; puce LR7843 (boîtier TO-252, languette métal) à gauche, optocoupleur à droite, diode, trous de soudure ; le dessous de la carte est à −depth/2. */
export function driverGeometry(p: Plank): PartGeometry {
  const parts: Part[] = [];
  const n = Math.max(1, Math.round((p.h + GAP) / (BOARD_H + GAP))), pitch = n === 1 ? 0 : (p.h - BOARD_H) / (n - 1), zb = -(p.depth ?? 20) / 2;
  for (let k = 0; k < n; k++) {
    const y = n === 1 ? 0 : -p.h / 2 + BOARD_H / 2 + k * pitch;
    const board = new BoxGeometry(p.w, BOARD_H, 1.6); board.translate(0, y, zb + 0.8); parts.push({ g: board, c: new Color(p.color ?? PALETTE.driverRed) });
    const chip = new BoxGeometry(6.5, 6, 2.3); chip.translate(-p.w / 2 + 9, y, zb + 1.6 + 1.15); parts.push({ g: chip, c: new Color(PALETTE.slate) });
    const tab = new BoxGeometry(6.5, 5, 0.6); tab.translate(-p.w / 2 + 9, y + 0.2, zb + 1.6 + 2.6); parts.push({ g: tab, c: new Color(PALETTE.steel) });
    const opto = new BoxGeometry(4.5, 4, 2); opto.translate(p.w / 2 - 6, y, zb + 1.6 + 1); parts.push({ g: opto, c: new Color(PALETTE.slate) });
    const diode = new BoxGeometry(3.4, 1.4, 1.2); diode.translate(0, y - 5.5, zb + 1.6 + 0.6); parts.push({ g: diode, c: new Color(PALETTE.driverRed) });
    for (const dy of [-5, 0, 5]) { const pad = new BoxGeometry(2.8, 2.8, 0.2); pad.translate(-p.w / 2 + 2.2, y + dy, zb + 1.7); parts.push({ g: pad, c: new Color(PALETTE.steel) }); }
  }
  const geo = mergeColored(parts);
  return { geo, edges: edgesOf(geo) };
}
