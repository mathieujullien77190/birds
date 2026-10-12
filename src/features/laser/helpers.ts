import { DEFAULT_CUT_CFG } from './constants';
import type { CutCfg, Sheets } from './types';

/** Réglages de planche lus du texte stocké (valeurs par défaut si absent ou invalide). */
export function parseCutCfg(raw: string | null): CutCfg {
  try { const d = JSON.parse(raw ?? ''); if (d && typeof d.W === 'number') return d; } catch { /* rien */ }
  return { ...DEFAULT_CUT_CFG };
}

/** Un SVG par planche, prêt à être rangé dans l'archive : nom `planche[-mdf|-okoume]-N-LxH.svg` et contenu. */
export function sheetFiles(sheets: Sheets, cfg: CutCfg, svgOf: (sheet: Sheets[number], W: number, H: number, index: number) => string): { name: string; data: string }[] {
  return sheets.map((sh, i) => ({ name: `${sh.material === 'mdf' ? 'planche-mdf' : sh.material === 'okoume' ? 'planche-okoume' : 'planche'}-${i + 1}-${cfg.W}x${cfg.H}.svg`, data: svgOf(sh, cfg.W, cfg.H, i) }));
}
