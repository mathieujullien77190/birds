import type { Segment } from '../../grbl';

/** Chemin SVG des segments coupés (`cut`, ou `engrave` pour la gravure) ou rapides, les segments qui se suivent étant joints en une seule polyligne. */
export function segmentsPath(segments: Segment[], cut: boolean, engrave: boolean): string {
  let d = '';
  let ex = Infinity, ey = Infinity;
  const f = (n: number) => +n.toFixed(2);
  for (const s of segments) {
    if (s.cut !== cut || (cut && !!s.engrave !== engrave)) continue;
    if (Math.abs(s.x0 - ex) > 1e-6 || Math.abs(s.y0 - ey) > 1e-6) d += `M${f(s.x0)} ${f(s.y0)}`;
    d += `L${f(s.x1)} ${f(s.y1)}`;
    ex = s.x1; ey = s.y1;
  }
  return d;
}
