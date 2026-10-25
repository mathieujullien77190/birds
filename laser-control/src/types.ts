import type { PassMode } from './grbl';

/** Réglages de la machine gardés d'une session à l'autre. */
export interface MachineSettings {
  /** Vitesse de coupe (mm/min). */
  feed: number;
  /** Puissance de coupe (%). */
  power: number;
  passes: number;
  passMode: PassMode;
  /** Assistance d'air (pompe de la carte) : `M8` / `M9` autour de la coupe. */
  air: boolean;
  /** Plafond de puissance (%). */
  capPct: number;
  /** Vitesse des déplacements manuels (mm/min). */
  jogFeed: number;
  jogStep: number;
  /** Gravure (couche bleue d'un SVG) : vitesse (mm/min) et puissance (%). */
  engraveFeed: number;
  engravePower: number;
  /** Cadre : autour des pièces ou de la planche entière. */
  frameMode: 'pieces' | 'sheet';
}
