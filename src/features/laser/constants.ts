import { DEFAULT_SHEET } from '@/birdhouse/model';
import type { CutCfg } from './types';

/** Clé localStorage des réglages de la planche. */
export const CUT_CFG_KEY = 'plaques-decoupe';

export const DEFAULT_CUT_CFG: CutCfg = { W: DEFAULT_SHEET.W, H: DEFAULT_SHEET.H, gap: 5 };

/** Machines connues : la planche (mm) est la zone de gravure de la machine. Les curseurs de la section « Découpe laser » restent libres pour toute autre machine. */
export const LASER_MACHINES = [
  { id: 's30-pro', label: 'S30 Pro', W: 410, H: 400 },
  { id: 's30-ultra', label: 'S30 Ultra 22 W', W: 590, H: 595 },
  { id: 'board-400', label: 'Planches 400 × 400', W: 400, H: 400 }, // contreplaqué 3 mm du commerce en 400 × 400 (lots de 15) ; les lames d'okoumé (399 mm de haut) n'y tiennent pas : les prendre en panneau plus grand
] as const;

/** Hauteur d'espace laissée entre deux planches dans l'aperçu (mm). */
export const SHEET_GAP_PREVIEW = 12;
