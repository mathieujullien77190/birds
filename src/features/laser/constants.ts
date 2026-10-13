import { DEFAULT_SHEET } from '@/birdhouse/model';
import type { CutCfg } from './types';

/** Clé localStorage des réglages de la planche. */
export const CUT_CFG_KEY = 'plaques-decoupe';

export const DEFAULT_CUT_CFG: CutCfg = { W: DEFAULT_SHEET.W, H: DEFAULT_SHEET.H, gap: 5 };

/** Hauteur d'espace laissée entre deux planches dans l'aperçu (mm). */
export const SHEET_GAP_PREVIEW = 12;
