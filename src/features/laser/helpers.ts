import { DEFAULT_CUT_CFG } from './constants';
import type { CutCfg, Sheets } from './types';

/** Réglages de planche lus du texte stocké (valeurs par défaut si absent ou invalide). */
export function parseCutCfg(raw: string | null): CutCfg {
  try {
    const d = JSON.parse(raw ?? '');
    if (d && typeof d.W === 'number') return d.W === 400 && d.H === 320 ? { ...DEFAULT_CUT_CFG, gap: d.gap ?? DEFAULT_CUT_CFG.gap } : d; // 400 × 320 = l'ancien réglage par défaut : la planche générale est maintenant 300 × 300
  } catch { /* rien */ }
  return { ...DEFAULT_CUT_CFG };
}

/** Un SVG par planche, prêt à être rangé dans l'archive : nom `planche[-mdf|-okoume]-N-LxH.svg` et contenu. */
export function sheetFiles(sheets: Sheets, cfg: CutCfg, svgOf: (sheet: Sheets[number], W: number, H: number, index: number) => string): { name: string; data: string }[] {
  return sheets.map((sh, i) => ({ name: `${sh.material === 'mdf' ? 'planche-mdf' : sh.material === 'okoume' ? 'planche-okoume' : 'planche'}-${i + 1}-${cfg.W}x${cfg.H}.svg`, data: svgOf(sh, cfg.W, cfg.H, i) }));
}

/** Libellé de la planche d'essai des crans. */
export const boxTestLabel = (i: number): string => `Essai boîte${i ? ` (${i + 1})` : ''}`;
