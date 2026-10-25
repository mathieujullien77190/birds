import type { nestSheets } from '@/birdhouse/model';

/** Planche de découpe laser : largeur, hauteur et espace entre les pièces (mm). */
export interface CutCfg { W: number; H: number; gap: number }

/** Planche « Essai boîte » (deux plaques à crans) : disponible si la scène a un bouchon de prise d'air, `select` la choisit pour le pilotage. */
export interface BoxTest { available: boolean; select: () => void }

export type Sheets = ReturnType<typeof nestSheets>;
