import { BoxGeometry, Color } from 'three';
import { PALETTE } from '../../registry/palette';
import { mergeColored, edgesOf, type Part, type PartGeometry } from '../geometry';
import type { Plank } from '../../../model';

/** Module MOSFET (type XY-MOS) : carte rouge, MOSFET noir avec languette, deux borniers bleus de chaque côté. */
export function driverGeometry(p: Plank): PartGeometry {
  const parts: Part[] = [];
  parts.push({ g: (() => { const g = new BoxGeometry(p.w, p.h, 1.6); g.translate(0, 0, -(p.depth ?? 20) / 2 + 0.8); return g; })(), c: new Color(p.color ?? PALETTE.driverRed) });
  const z0 = -(p.depth ?? 20) / 2 + 1.6;
  const mos = new BoxGeometry(10, 4.5, 15); mos.translate(0, 2, z0 + 7.5); parts.push({ g: mos, c: new Color(PALETTE.slate) });
  const tab = new BoxGeometry(10, 1, 10); tab.translate(0, 4.9, z0 + 6); parts.push({ g: tab, c: new Color(PALETTE.steel) });
  for (const sx of [-1, 1]) for (const dy of [-5, 5]) { const term = new BoxGeometry(8, 8, 10); term.translate(sx * (p.w / 2 - 4.5), dy, z0 + 5); parts.push({ g: term, c: new Color(PALETTE.terminalBlue) }); }
  const led = new BoxGeometry(3, 3, 1.5); led.translate(8, -7, z0 + 0.75); parts.push({ g: led, c: new Color(PALETTE.ledGreen) });
  const geo = mergeColored(parts);
  return { geo, edges: edgesOf(geo) };
}
