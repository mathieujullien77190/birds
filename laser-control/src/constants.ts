import type { MachineSettings } from './types';

/** Clé localStorage des réglages de la machine (vitesse, puissance, passes, plafond…). */
export const MACHINE_SETTINGS_KEY = 'laser-reglages';

/**
 * Valeurs de départ PRUDENTES, À CALIBRER : elles ne sont qu'un point de départ pour un contreplaqué de 3 mm sur la diode de 22 W de la Sculpfun S30 Ultra (puissance lumineuse annoncée).
 * Lancer la planche d'essai (carrés par vitesse × puissance) pour trouver le bon couple avant de couper de vraies pièces.
 */
export const DEFAULT_MACHINE_SETTINGS: MachineSettings = {
  feed: 300,
  power: 60,
  passes: 3,
  passMode: 'all',
  air: true, // l'assistance d'air de la S30 Ultra est commandée par la carte (M8 / M9)
  capPct: 80,
  jogFeed: 3000,
  jogStep: 10,
  engraveFeed: 1500,
  engravePower: 15,
  frameMode: 'pieces',
  test: { speedMin: 150, speedMax: 450, speedCount: 4, powerMin: 40, powerMax: 80, powerCount: 4, size: 10, passes: 3 },
};

/** Pas de déplacement manuel proposés (mm). */
export const JOG_STEPS = [0.1, 1, 10, 50] as const;

/** Vitesse de coupe : bornes du curseur (mm/min). */
export const FEED_RANGE = { min: 20, max: 3000 } as const;
