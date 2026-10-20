import { Vector3 } from 'three';
import { outline, type Plank, type PlankScene } from '@/birdhouse/model';
import { obb, pathItems, thick } from './geomChecks';

/** Aucun fil ne traverse une pièce solide : on échantillonne la courbe réellement dessinée (coudes arrondis, lissage centripète, comme `wire.ts`) et on cherche de la matière autour (rayon du fil, tolérance 0,3 mm). */

const inPoly = (pt: [number, number], poly: [number, number][]): boolean => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };

/** Pièces qu'un fil peut légitimement traverser : isolant (laine), habillage, gaine, documents, panneau solaire, grillages. */
const OK = /^(Isolant|Lambris|Dossier du nichoir|Grillage|Laine)/;

export function materialAt(p: Plank, pt: Vector3, t: number, margin: number): boolean {
  const b = obb(p, t), d = pt.clone().sub(b.c), lx = d.dot(b.ax[0]), ly = d.dot(b.ax[1]), lz = d.dot(b.ax[2]), h = thick(p, t) / 2 - margin;
  if (Math.abs(lz) > h) return false;
  if (p.special === 'block' || p.special === 'bar' || p.special === 'driver' || p.special === 'camera' || p.special === 'ir' || p.special === 'sensor' || p.special === 'pi' || p.special === 'fan') return Math.abs(lx) <= p.w / 2 - margin && Math.abs(ly) <= p.h / 2 - margin && !p.holes.some((hh) => Math.abs(lx - hh.x) <= hh.size / 2 && Math.abs(ly - hh.y) <= (hh.sh ?? hh.size) / 2);
  return inPoly([lx, ly], p.poly ?? outline(p)) && !p.holes.some((hh) => (hh.poly ? inPoly([lx, ly], hh.poly) : Math.abs(lx - hh.x) <= hh.size / 2 && Math.abs(ly - hh.y) <= (hh.sh ?? hh.size) / 2));
}

/** Traversées : [fil, pièce, longueur de courbe (mm) dans la matière]. */
export function crossings(sc: PlankScene): [string, string, number][] {
  const t = sc.t, solids = sc.planks.filter((p) => !p.path && p.special !== 'doc' && !OK.test(p.name));
  const out = new Map<string, number>();
  for (const w of sc.planks.filter((p) => p.special === 'wire' && p.path && !/^Câble 12 V/.test(p.name))) {
    const it = pathItems([w])[0], r = w.w / 2, a = it.ends[0], z = it.ends[1];
    for (let i = 1; i < it.pts.length; i++) {
      const pt = it.pts[i];
      if (pt.distanceTo(a) < 14 || pt.distanceTo(z) < 14) continue; // les bouts entrent dans une broche, un bornier, un module
      for (const s of solids) {
        const b = obb(s, t);
        if (pt.distanceTo(b.c) > Math.hypot(...b.h) + r + 1) continue;
        const probes = [pt, ...[0, 1, 2].flatMap((k) => [1, -1].map((sg) => pt.clone().addScaledVector(b.ax[k], sg * Math.min(r, 1.8))))];
        if (probes.some((q) => materialAt(s, q, t, 0.3))) { const k = w.name + '|' + s.name; out.set(k, (out.get(k) ?? 0) + pt.distanceTo(it.pts[i - 1])); }
      }
    }
  }
  return [...out].map(([k, v]) => [...(k.split('|') as [string, string]), v]);
}

