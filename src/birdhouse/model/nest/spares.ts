import { type Plank } from '../types';
import { r2, uid } from '../util';
import { THIN } from '../constants';
import { outline } from '../geometry/outline';

/**
 * Pièces fines de rechange (fonctions pures, aucun import de three.js) : pour chaque plaque FINE découpée au laser (voir `THIN`), `THIN.copies` exemplaires
 * identiques (même contour, trous, dents, matériau) posés à plat sur le sol, à côté du nichoir. Deux plaques strictement identiques portent le même code
 * de numérotation (`plankSignature`) : une rechange porte donc le numéro de son original.
 */

/** Suffixe des noms de rechange : « Poignée cassette 2 (rechange 1) ». */
export const SPARE_RE = / \(rechange \d+\)$/;

/** Boîte englobante et largeur moyenne (2 × aire / périmètre) du contour d'une plaque (trous exclus). */
export function shapeMeasure(p: Plank): { w: number; h: number; x0: number; y0: number; mean: number } {
  const o = outline(p);
  let area = 0, per = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < o.length; i++) {
    const a = o[i], b = o[(i + 1) % o.length];
    area += a[0] * b[1] - b[0] * a[1]; per += Math.hypot(b[0] - a[0], b[1] - a[1]);
    x0 = Math.min(x0, a[0]); x1 = Math.max(x1, a[0]); y0 = Math.min(y0, a[1]); y1 = Math.max(y1, a[1]);
  }
  return { w: x1 - x0, h: y1 - y0, x0, y0, mean: (2 * Math.abs(area / 2)) / per };
}

/** Plaque fine à doubler : découpée au laser, ni baguette de cale (déjà en triple), ni rechange. */
export function isThin(p: Plank): boolean {
  if (p.special || /^Baguette de cale/.test(p.name) || SPARE_RE.test(p.name)) return false;
  const m = shapeMeasure(p);
  return Math.min(m.w, m.h) <= THIN.maxWidth || m.mean <= THIN.maxWidth;
}

/**
 * Les exemplaires de rechange des plaques fines de `planks`, rangés en rangées (de gauche à droite, du bas vers le haut) dans le coin (`x`, `y`) vers la gauche et l'arrière :
 * le bord droit de la première rangée est en `right`, le bord avant de la plus basse en `front`. Chaque rechange est à plat (rot = 0, sur le sol).
 */
export function thinSpares(planks: Plank[], t: number, group: string, right: number, front: number): Plank[] {
  const out: Plank[] = [];
  let x = right, y = front, rowH = 0;
  for (const p of planks.filter(isThin)) {
    const m = shapeMeasure(p), thick = p.material ? (p.depth ?? t) : t;
    for (let k = 1; k <= THIN.copies; k++) {
      if (right - x + m.w > THIN.rowWidth && x < right) { x = right; y += rowH + THIN.gap; rowH = 0; }
      const cx = x - m.w / 2, cy = y + m.h / 2; // centre de la boîte englobante
      out.push({ ...p, id: uid(), name: `${p.name} (rechange ${k})`, spareOf: p.id, group, rot: [0, 0, 0], pos: [r2(cx - (m.x0 + m.w / 2)), r2(cy - (m.y0 + m.h / 2)), r2(thick / 2)],
        notches: p.notches.map((n) => ({ ...n, id: uid() })), holes: p.holes.map((h) => ({ ...h, id: uid() })), cast: p.cast ? { ...p.cast } : undefined, url: undefined });
      x -= m.w + THIN.gap; rowH = Math.max(rowH, m.h);
    }
  }
  return out;
}
