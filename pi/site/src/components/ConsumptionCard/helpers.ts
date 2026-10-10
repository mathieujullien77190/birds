import { CAPACITE_WH } from '@/constants';

/** Heures restantes = Wh restants / watts consommés ; null si on ne sait pas ou si rien ne consomme. */
export const autonomyHours = (pct: number | null, totalW: number | null): number | null =>
  pct === null || !totalW || totalW <= 0 ? null : ((pct / 100) * CAPACITE_WH) / totalW;

/** 7,5 h → « 7 h 30 » ; au-delà de 48 h → « N jours ». */
export const formatHours = (h: number): string => {
  if (h >= 48) return `${Math.round(h / 24)} jours`;
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
};
