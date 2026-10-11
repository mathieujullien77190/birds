import { DEFAULT_CUT_CFG, DEFAULT_MACHINE_SETTINGS } from './constants';
import type { CutCfg, MachineSettings } from './types';

/** Réglages de planche lus du texte stocké (valeurs par défaut si absent ou invalide). */
export function parseCutCfg(raw: string | null): CutCfg {
  try { const d = JSON.parse(raw ?? ''); if (d && typeof d.W === 'number') return d; } catch { /* rien */ }
  return { ...DEFAULT_CUT_CFG };
}

const clamp = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

/** Réglages de la machine lus du texte stocké : champs manquants ou hors bornes ramenés aux valeurs (prudentes) par défaut. */
export function parseMachineSettings(raw: string | null): MachineSettings {
  const d = DEFAULT_MACHINE_SETTINGS;
  let s: Partial<MachineSettings> & { test?: Partial<MachineSettings['test']> } = {};
  try { const j = JSON.parse(raw ?? ''); if (j && typeof j === 'object') s = j; } catch { /* rien */ }
  const t: Partial<MachineSettings['test']> = s.test ?? {};
  return {
    feed: clamp(s.feed, 1, 6000, d.feed),
    power: clamp(s.power, 0, 100, d.power),
    passes: Math.round(clamp(s.passes, 1, 20, d.passes)),
    passMode: s.passMode === 'contour' ? 'contour' : 'all',
    capPct: clamp(s.capPct, 1, 100, d.capPct),
    jogFeed: clamp(s.jogFeed, 50, 6000, d.jogFeed),
    jogStep: [0.1, 1, 10, 50].includes(s.jogStep as number) ? (s.jogStep as number) : d.jogStep,
    frameMode: s.frameMode === 'sheet' ? 'sheet' : 'pieces',
    test: {
      speedMin: clamp(t.speedMin, 10, 6000, d.test.speedMin), speedMax: clamp(t.speedMax, 10, 6000, d.test.speedMax), speedCount: Math.round(clamp(t.speedCount, 1, 8, d.test.speedCount)),
      powerMin: clamp(t.powerMin, 1, 100, d.test.powerMin), powerMax: clamp(t.powerMax, 1, 100, d.test.powerMax), powerCount: Math.round(clamp(t.powerCount, 1, 8, d.test.powerCount)),
      size: clamp(t.size, 5, 30, d.test.size), passes: Math.round(clamp(t.passes, 1, 20, d.test.passes)),
    },
  };
}
