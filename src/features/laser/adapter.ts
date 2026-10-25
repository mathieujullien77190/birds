import { sheetFrame, sheetLabel, type NestSheet } from '@/birdhouse/model';
import type { LaserItem, LaserJob, Polyline } from '@laser';

/** Les trous sont découpés 0,2 mm plus petits en diamètre (en largeur et hauteur) : le trait de la laser retire de la matière et agrandit le trou (0,1 puis encore 0,1 d'après l'essai). */
export const HOLE_SHRINK = 0.3;

/** Un trou rétréci de `HOLE_SHRINK` en largeur et en hauteur, autour du centre de son encombrement (cercle, rectangle, peigne). Les très petits trous restent tels quels. */
export function shrinkHole(pts: [number, number][]): [number, number][] {
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), w = x1 - x0, h = y1 - y0;
  if (w <= HOLE_SHRINK * 2.5 || h <= HOLE_SHRINK * 2.5) return pts;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, kx = (w - HOLE_SHRINK) / w, ky = (h - HOLE_SHRINK) / h;
  return pts.map(([x, y]): [number, number] => [cx + (x - cx) * kx, cy + (y - cy) * ky]);
}

/** Remarque affichée sous l'aperçu du trajet : ce que la machine reçoit (et ce qu'elle ne reçoit pas). */
const NOTICE = 'Le cadre autour des pièces et le code de chaque plaque (T01…, en bleu) sont gravés à bas régime avant la coupe ; les noms des pièces ne sont pas gravés. Les coupes (contours des pièces et de leurs trous) suivent.';

/**
 * Une planche de `nestSheets` → un `LaserJob` de laser-control. Le repère de la planche a l'origine EN HAUT à gauche (y vers le bas, comme le SVG) ;
 * celui de la laser a l'origine en BAS à gauche : Ymachine = H − ySVG. Chaque plaque devient une pièce (contour extérieur + trous, ceux-ci 0,2 mm plus petits en diamètre).
 */
export function sheetToJob(sheet: NestSheet, W: number, H: number): LaserJob {
  const pieces = sheet.items.map((it) => {
    const conv = (pts: [number, number][]): Polyline => pts.map(([a, b]): [number, number] => [it.x + a, H - (it.y + it.h - b)]);
    return { name: it.plank.name, contours: [conv(it.poly), ...it.holes.map((hl) => conv(shrinkHole(hl)))] };
  });
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const it of sheet.items) { minX = Math.min(minX, it.x); maxX = Math.max(maxX, it.x + it.w); minY = Math.min(minY, H - (it.y + it.h)); maxY = Math.max(maxY, H - it.y); }
  const fr = sheetFrame(sheet), frameLine: Polyline[] = fr ? [[[fr.x0, H - fr.y0], [fr.x1, H - fr.y0], [fr.x1, H - fr.y1], [fr.x0, H - fr.y1]]] : []; // le cadre bleu : le contour de toutes les pièces, gravé avant tout
  const codes = sheet.items.flatMap((it) => (it.engrave ?? []).map((c): Polyline => c.map(([a, b]): [number, number] => [it.x + a, H - (it.y + it.h - b)]))); // le code de chaque plaque, gravé avant la coupe
  return {
    widthMm: W, heightMm: H, title: 'Nichoir high tech — découpe laser',
    layers: { cut: pieces.flatMap((p) => p.contours), ...(frameLine.length || codes.length ? { engrave: [...frameLine, ...codes] } : {}) },
    pieces,
    frame: sheet.items.length ? { minX, minY, maxX, maxY } : undefined, // le cadre « autour des pièces » suit les plaques entières
  };
}

/** Toutes les planches de la scène, prêtes pour le pilotage : « Planche 1 », « Planche MDF 1 »…, fichiers `planche-N.gcode`. */
export function sheetsToItems(sheets: NestSheet[], W: number, H: number): LaserItem[] {
  return sheets.map((sh, i) => ({ label: sheetLabel(sheets, i), fileName: `planche-${i + 1}`, job: sheetToJob(sh, W, H), notice: NOTICE }));
}
