import { CAPACITE_WH } from '@/constants';
import { LEVEL_COLORS } from './constants';

/** Vert au-dessus de 50 %, orange de 20 à 50 %, rouge en dessous ; gris si inconnu. */
export const levelColor = (pct: number | null): string =>
  pct === null ? LEVEL_COLORS.unknown : pct > 50 ? LEVEL_COLORS.high : pct >= 20 ? LEVEL_COLORS.mid : LEVEL_COLORS.low;

/** Énergie restante estimée, en Wh (une décimale). */
export const remainingWh = (pct: number): number => Math.round((pct / 100) * CAPACITE_WH * 10) / 10;
