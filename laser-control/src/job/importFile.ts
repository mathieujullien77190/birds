import { parseSvg } from './svg';
import type { LaserItem } from './types';

/** Extensions de G-code acceptées. */
export const GCODE_EXT = ['gcode', 'gc', 'nc', 'ngc', 'tap', 'txt'];

/** Exemple : carré de 100 × 100 mm avec un trou rond, un petit carré et une gravure, sur une planche de 120 × 120 mm (même convention que les SVG de l'application du nichoir). */
export const EXAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="120mm" height="120mm" viewBox="0 0 120 120">
<rect x="0.05" y="0.05" width="119.9" height="119.9" fill="none" stroke="#bbb" stroke-width="0.1" stroke-dasharray="2 2"/>
<polygon points="10,10 110,10 110,110 10,110" fill="none" stroke="#000" stroke-width="0.1"/>
<circle cx="60" cy="60" r="20" fill="none" stroke="#000" stroke-width="0.1"/>
<rect x="20" y="20" width="12" height="12" fill="none" stroke="#000" stroke-width="0.1"/>
<polygon points="80,80 100,80 100,100 80,100" fill="none" stroke="#00f" stroke-width="0.1"/>
</svg>`;

/**
 * Transforme le contenu d'un fichier déposé en programme à piloter : SVG (traits noirs = coupe, bleus = gravure) ou G-code (envoyé tel quel).
 * Lève une `Error` au message lisible si le fichier n'est pas exploitable.
 */
export function itemFromFile(fileName: string, text: string): LaserItem {
  const dot = fileName.lastIndexOf('.');
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
  const base = (dot > 0 ? fileName.slice(0, dot) : fileName) || 'fichier';
  if (ext === 'svg' || (!GCODE_EXT.includes(ext) && /<svg[\s>]/i.test(text))) {
    const { job, warnings } = parseSvg(text);
    if (!job.layers.cut.length && !job.layers.engrave?.length) throw new Error(warnings[warnings.length - 1] ?? 'Rien à découper dans ce SVG.');
    job.title = base;
    return { label: fileName, fileName: base, job, notice: [`Traits noirs = coupe (${job.layers.cut.length}), traits bleus = gravure (${job.layers.engrave?.length ?? 0}) ; le reste est ignoré.`, ...warnings].join(' ') };
  }
  if (GCODE_EXT.includes(ext) || /^\s*[GM$;(]/i.test(text)) {
    if (!/[GM]\d/i.test(text)) throw new Error("Ce fichier ne contient pas de G-code (aucune commande G ou M).");
    return { label: fileName, fileName: base, gcode: text, notice: 'G-code importé : envoyé tel quel (commandes « $… » retirées, puissance limitée au plafond).' };
  }
  throw new Error('Format non reconnu : dépose un fichier .svg ou un G-code (.gcode, .nc).');
}
