import type { MachineSettings } from './types';

/** Clé localStorage des réglages de la machine (vitesse, puissance, passes, plafond…). */
export const MACHINE_SETTINGS_KEY = 'laser-reglages';

/**
 * Valeurs de départ du constructeur (tableau « Sculpfun E1 Paramètres », laser bleu 21 W, contreplaqué de tilleul 3 mm : coupe 750 mm/min à 100 % en 1 passe, gravure 5000 mm/min à 10 %), À CALIBRER selon le contreplaqué réel.
 * Lancer la planche d'essai (carrés par vitesse × puissance) pour trouver le bon couple avant de couper de vraies pièces.
 */
export const DEFAULT_MACHINE_SETTINGS: MachineSettings = {
  feed: 750,
  power: 100,
  passes: 1,
  passMode: 'all',
  air: true, // l'assistance d'air de la E1 Pro est commandée par la carte (M8 / M9)
  capPct: 100,
  jogFeed: 3000,
  jogStep: 10,
  engraveFeed: 5000,
  engravePower: 10,
  frameMode: 'pieces',
  test: { speedMin: 450, speedMax: 900, speedCount: 4, powerMin: 70, powerMax: 100, powerCount: 4, size: 10, passes: 1 },
};

/** Pas de déplacement manuel proposés (mm). */
export const JOG_STEPS = [0.1, 1, 10, 50] as const;

/** Vitesse de coupe : bornes du curseur (mm/min). */
export const FEED_RANGE = { min: 20, max: 6000 } as const;
