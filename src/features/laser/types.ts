import type { nestSheets } from '@/birdhouse/model';

/** Planche de découpe laser : largeur, hauteur et espace entre les pièces (mm). */
export interface CutCfg { W: number; H: number; gap: number }

export type Sheets = ReturnType<typeof nestSheets>;
