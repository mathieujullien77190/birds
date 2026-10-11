import type { HistoryPoint } from '@/types';

/** Échelle verticale automatique : de l'entier en dessous du minimum à l'entier au-dessus du maximum, au moins 4 °C d'écart ; null s'il n'y a aucune mesure. */
export function temperatureRange(points: HistoryPoint[]): { min: number; max: number } | null {
  const values = points.flatMap((p) => [p.nid, p.ext]).filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  let min = Math.floor(Math.min(...values) - 1);
  let max = Math.ceil(Math.max(...values) + 1);
  if (max - min < 4) { const mid = (min + max) / 2; min = Math.floor(mid - 2); max = min + 4; }
  return { min, max };
}

/** Traits d'une courbe : une valeur manquante (capteur muet) coupe la ligne en deux tronçons. Renvoie les attributs `d` des chemins SVG. */
export function linePaths(values: (number | null)[], x: (i: number) => number, y: (v: number) => number): string[] {
  const paths: string[] = [];
  let current = '';
  values.forEach((v, i) => {
    if (v === null) { if (current) paths.push(current); current = ''; return; }
    current += `${current ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  if (current) paths.push(current);
  return paths;
}

/** Au plus `n` repères d'heure répartis sur l'axe (indices dans la liste des points). */
export function timeTicks(count: number, n: number): number[] {
  if (count <= 1) return [0];
  const step = Math.max(1, Math.round((count - 1) / (n - 1)));
  const ticks: number[] = [];
  for (let i = 0; i < count; i += step) ticks.push(i);
  if (count - 1 - ticks[ticks.length - 1] > step / 2) ticks.push(count - 1);
  return ticks;
}

/** Vrai quand il y a de quoi tracer une courbe (au moins deux points avec une mesure du nid ou de dehors). */
export const hasData = (points: HistoryPoint[]): boolean => points.filter((p) => p.nid !== null || p.ext !== null).length >= 2;
