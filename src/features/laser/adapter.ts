import { sheetLabel, type NestSheet } from '@/birdhouse/model';
import type { LaserItem, LaserJob, Polyline } from '@laser';

/** Remarque affichée sous l'aperçu du trajet : ce que la machine reçoit (et ce qu'elle ne reçoit pas). */
const NOTICE = 'Le code de chaque plaque (T01…, en bleu) est gravé à bas régime avant la coupe ; les noms des pièces ne sont pas gravés. Les coupes (contours des pièces et de leurs trous) suivent.';

/**
 * Une planche de `nestSheets` → un `LaserJob` de laser-control. Le repère de la planche a l'origine EN HAUT à gauche (y vers le bas, comme le SVG) ;
 * celui de la laser a l'origine en BAS à gauche : Ymachine = H − ySVG. Chaque plaque devient une pièce (contour extérieur + trous).
 */
export function sheetToJob(sheet: NestSheet, W: number, H: number): LaserJob {
  const pieces = sheet.items.map((it) => {
    const conv = (pts: [number, number][]): Polyline => pts.map(([a, b]): [number, number] => [it.x + a, H - (it.y + it.h - b)]);
    return { name: it.plank.name, contours: [conv(it.poly), ...it.holes.map(conv)] };
  });
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const it of sheet.items) { minX = Math.min(minX, it.x); maxX = Math.max(maxX, it.x + it.w); minY = Math.min(minY, H - (it.y + it.h)); maxY = Math.max(maxY, H - it.y); }
  const engrave = sheet.items.flatMap((it) => (it.engrave ?? []).map((c): Polyline => c.map(([a, b]): [number, number] => [it.x + a, H - (it.y + it.h - b)]))); // le code de chaque plaque, gravé avant la coupe
  return {
    widthMm: W, heightMm: H, title: 'Nichoir high tech — découpe laser',
    layers: { cut: pieces.flatMap((p) => p.contours), ...(engrave.length ? { engrave } : {}) },
    pieces,
    frame: sheet.items.length ? { minX, minY, maxX, maxY } : undefined, // le cadre « autour des pièces » suit les plaques entières
  };
}

/** Toutes les planches de la scène, prêtes pour le pilotage : « Planche 1 », « Planche MDF 1 »…, fichiers `planche-N.gcode`. */
export function sheetsToItems(sheets: NestSheet[], W: number, H: number): LaserItem[] {
  return sheets.map((sh, i) => ({ label: sheetLabel(sheets, i), fileName: `planche-${i + 1}`, job: sheetToJob(sh, W, H), notice: NOTICE }));
}
