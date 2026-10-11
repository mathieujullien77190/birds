import { DEFAULT_CUT_CFG } from './constants';
import type { CutCfg } from './types';

/** Réglages de planche lus du texte stocké (valeurs par défaut si absent ou invalide). */
export function parseCutCfg(raw: string | null): CutCfg {
  try { const d = JSON.parse(raw ?? ''); if (d && typeof d.W === 'number') return d; } catch { /* rien */ }
  return { ...DEFAULT_CUT_CFG };
}
