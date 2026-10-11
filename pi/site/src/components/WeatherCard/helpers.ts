/** Écart entre le nid et l'extérieur (°C, arrondi au dixième), ou null si l'une des deux mesures manque. */
export function nestDelta(nest: number | null | undefined, outside: number | null | undefined): number | null {
  if (nest == null || outside == null) return null;
  return Math.round((nest - outside) * 10) / 10;
}
