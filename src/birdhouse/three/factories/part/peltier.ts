import { BoxGeometry, Color } from 'three';
import { PALETTE } from '../../registry/palette';
import { mergeColored, edgesOf, type Part, type PartGeometry } from '../geometry';
import type { Plank } from '../../../model';

/** TEC1-12706 : deux céramiques blanches de 0,8 et l'âme grise (plots) entre elles. */
export function peltierGeometry(p: Plank): PartGeometry {
  const parts: Part[] = [], d = p.depth ?? 3.8, core = d - 1.6;
  const lo = new BoxGeometry(p.w, p.h, 0.8); lo.translate(0, 0, -d / 2 + 0.4); parts.push({ g: lo, c: new Color(PALETTE.coolWhite) });
  const hi = new BoxGeometry(p.w, p.h, 0.8); hi.translate(0, 0, d / 2 - 0.4); parts.push({ g: hi, c: new Color(PALETTE.coolWhite) });
  const mid = new BoxGeometry(p.w - 3, p.h - 3, core); parts.push({ g: mid, c: new Color(PALETTE.slate700) });
  const geo = mergeColored(parts);
  return { geo, edges: edgesOf(geo) };
}
