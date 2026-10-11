import type { nestSheets } from '@/birdhouse/model';
import type { PassMode } from './grbl';

/** Planche de découpe laser : largeur, hauteur et espace entre les pièces (mm). */
export interface CutCfg { W: number; H: number; gap: number }

export type Sheets = ReturnType<typeof nestSheets>;

/** Réglages de la planche d'essai (grille vitesses × puissances). */
export interface TestSettings {
  speedMin: number; speedMax: number; speedCount: number;
  powerMin: number; powerMax: number; powerCount: number;
  size: number;
  passes: number;
}

/** Réglages de la machine gardés d'une session à l'autre. */
export interface MachineSettings {
  /** Vitesse de coupe (mm/min). */
  feed: number;
  /** Puissance de coupe (%). */
  power: number;
  passes: number;
  passMode: PassMode;
  /** Plafond de puissance (%). */
  capPct: number;
  /** Vitesse des déplacements manuels (mm/min). */
  jogFeed: number;
  jogStep: number;
  /** Cadre : autour des pièces ou de la planche entière. */
  frameMode: 'pieces' | 'sheet';
  test: TestSettings;
}
