import { BoxGeometry, Color } from 'three';
import { coloredPart, type Part, type PartGeometry } from '../geometry';
import type { Plank } from '../../../model';

const PITCH = 7, BODY = '#d9dde3', LEVER = '#f97316', BRASS = '#c58f4c', HOLE = '#1f2937';

/**
 * Bornier Wago 221 (3 entrées = 221-413, 5 entrées = 221-415) : la rangée d'entrées suit y (pas de 7 mm), la face d'entrée est la face −x, le dessus est +z.
 * Corps en polycarbonate gris clair, un levier orange rabattu à plat par entrée, orifices sombres de 3,5 mm sur la face d'entrée, ressort et rail de laiton qui apparaissent
 * le long de la face opposée, pastille de polarité (couleur de la plaque : rouge pour le +, noir pour le −) sur le dessus.
 */
export function wagoGeometry(p: Plank): PartGeometry {
  const d = p.depth ?? 11, n = Math.max(1, Math.round(p.h / PITCH)), parts: Part[] = [];
  const box = (w: number, h: number, dz: number, x: number, y: number, z: number, c: string) => { const g = new BoxGeometry(w, h, dz); g.translate(x, y, z); parts.push({ g, c: new Color(c) }); };
  const bodyH = d - 3, zb = -d / 2 + bodyH / 2, zTop = -d / 2 + bodyH; // le corps, puis les leviers de 3 mm par-dessus
  box(p.w, p.h, bodyH, 0, 0, zb, BODY);
  box(1.2, p.h - 2, 2.4, p.w / 2 - 0.1, 0, zb - 0.6, BRASS); // le rail de laiton, vu à travers le corps côté opposé aux entrées
  for (let i = 0; i < n; i++) {
    const y = (i - (n - 1) / 2) * PITCH;
    box(0.4, 3.5, 3.5, -p.w / 2 - 0.1, y, zb - 0.6, HOLE); // orifice du câble (légèrement en saillie pour se voir)
    box(1.2, 3, 2.2, p.w / 2 - 0.1, y, zb - 0.6, BRASS); // ressort
    box(p.w - 3.5, 5.2, 3, -0.6, y, zTop + 1.5, LEVER); // levier rabattu, avec son encoche (la bosse du bout)
    box(1.6, 3.6, 3, -p.w / 2 + 2.2, y, zTop + 1.5, '#ea580c'); // bout arrondi du levier
  }
  box(1.2, p.h - 1, 0.4, p.w / 2 - 0.9, 0, zTop + 0.2, p.color ?? '#dc2626'); // pastille de polarité sur le dessus
  return coloredPart(parts);
}
