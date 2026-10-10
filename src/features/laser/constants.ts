import type { CutCfg } from './types';

/** Clé localStorage des réglages de la planche. */
export const CUT_CFG_KEY = 'plaques-decoupe';

export const DEFAULT_CUT_CFG: CutCfg = { W: 410, H: 400, gap: 5 };

/** Hauteur d'espace laissée entre deux planches dans l'aperçu (mm). */
export const SHEET_GAP_PREVIEW = 12;
