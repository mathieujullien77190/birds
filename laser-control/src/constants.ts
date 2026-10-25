import type { MachineSettings } from './types';

/** Clé localStorage des réglages de la machine (vitesse, puissance, passes, plafond…). */
export const MACHINE_SETTINGS_KEY = 'laser-reglages';

/**
 * Valeurs de départ du constructeur (tableau « Sculpfun E1 Paramètres », laser bleu 21 W, contreplaqué de tilleul 3 mm : coupe 750 mm/min à 100 % en 1 passe, gravure 5000 mm/min à 10 %), À CALIBRER selon le contreplaqué réel (départ de cette app : 660 mm/min à 100 %).
 * Lancer la planche d'essai (carrés par vitesse × puissance) pour trouver le bon couple avant de couper de vraies pièces.
 */
export const DEFAULT_MACHINE_SETTINGS: MachineSettings = {
  feed: 660, // choisi après la planche d'essai sur ta machine : il reste un fil de bois, la pièce ne tombe pas (le constructeur annonce 750 mm/min pour du tilleul de 3 mm)
  power: 100,
  passes: 1,
  passMode: 'all',
  air: true, // l'assistance d'air de la E1 Pro est commandée par la carte (M8 / M9)
  capPct: 100,
  jogFeed: 3000,
  jogStep: 10,
  engraveFeed: 5000,
  engravePower: 20, // les codes et traits bleus se voyaient à peine à 10 % (valeur du constructeur) : plus de puissance, même vitesse, ils marquent mieux
  frameMode: 'pieces',
};

/** Origine de planche spéciale : décalage de l'origine de travail (X0 Y0) par rapport à l'origine machine (mm) : la tête se range 8 mm plus loin sur X. Bouton « Origine planche » : `G10 L2 P1 X8 Y0`, puis la tête s'y rend. */
export const PLATE_ORIGIN = { x: 8, y: 0 } as const;

/** Planche d'essai intégrée à la liste des planches : 6 vitesses (colonnes) × 6 puissances (lignes) de carrés de 10 mm, valeurs gravées à côté. */
export const TEST_CARD = { speedMin: 300, speedMax: 1200, speedCount: 6, powerMin: 40, powerMax: 100, powerCount: 6, size: 10, gap: 5, passes: 1 } as const;

/** Pas de déplacement manuel proposés (mm). */
export const JOG_STEPS = [0.1, 1, 10, 50] as const;

/** Vitesse de coupe : bornes du curseur (mm/min). */
export const FEED_RANGE = { min: 20, max: 6000 } as const;
