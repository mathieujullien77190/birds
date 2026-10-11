import type { CutCfg, MachineSettings } from './types';

/** Clé localStorage des réglages de la planche. */
export const CUT_CFG_KEY = 'plaques-decoupe';

export const DEFAULT_CUT_CFG: CutCfg = { W: 410, H: 400, gap: 5 };

/** Hauteur d'espace laissée entre deux planches dans l'aperçu (mm). */
export const SHEET_GAP_PREVIEW = 12;

/** Clé localStorage des réglages de la machine (vitesse, puissance, passes, plafond…). */
export const MACHINE_SETTINGS_KEY = 'laser-reglages';

/**
 * Valeurs de départ PRUDENTES, À CALIBRER : elles ne sont qu'un point de départ pour un contreplaqué de 3 mm sur une diode de 10 W.
 * Lancer la planche d'essai (carrés par vitesse × puissance) pour trouver le bon couple avant de couper de vraies pièces.
 */
export const DEFAULT_MACHINE_SETTINGS: MachineSettings = {
  feed: 300,
  power: 60,
  passes: 3,
  passMode: 'all',
  capPct: 80,
  jogFeed: 3000,
  jogStep: 10,
  frameMode: 'pieces',
  test: { speedMin: 150, speedMax: 450, speedCount: 4, powerMin: 40, powerMax: 80, powerCount: 4, size: 10, passes: 3 },
};

/** Pas de déplacement manuel proposés (mm). */
export const JOG_STEPS = [0.1, 1, 10, 50] as const;

/** Vitesse de coupe : bornes du curseur (mm/min). */
export const FEED_RANGE = { min: 20, max: 3000 } as const;
