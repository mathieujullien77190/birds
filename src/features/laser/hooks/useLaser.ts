import { useMemo, useState } from 'react';
import { crenelTestPlanks, nestSheets, sheetsPreviewSvg, type PlankScene } from '@/birdhouse/model';
import { usePersistentState } from '@/hooks';
import { useLaserMachine } from '@laser';
import { sheetsToItems } from '../adapter';
import { CUT_CFG_KEY } from '../constants';
import { boxTestLabel, parseCutCfg } from '../helpers';
import type { BoxTest } from '../types';

/** Découpe laser : réglages de la planche (gardés), rangement des pièces par planche, aperçu SVG, choix « 3D / planches » et pilotage de la machine (laser-control). */
export function useLaser(sc: PlankScene) {
  const [cutCfg, setCutCfg] = usePersistentState(CUT_CFG_KEY, parseCutCfg);
  const [cutView, setCutView] = useState(false); // aperçu des planches à la place de la 3D
  const sheets = useMemo(() => nestSheets(sc, cutCfg.W, cutCfg.H, cutCfg.gap), [sc, cutCfg]);
  const preview = useMemo(() => sheetsPreviewSvg(sheets, cutCfg.W, cutCfg.H), [sheets, cutCfg]);
  const boxSheets = useMemo(() => nestSheets(sc, cutCfg.W, cutCfg.H, cutCfg.gap, 8, () => false, crenelTestPlanks(sc)), [sc, cutCfg]); // rien de la scène : juste les deux plaques d'essai qui s'emboîtent
  const items = useMemo(() => [...sheetsToItems(sheets, cutCfg.W, cutCfg.H), ...sheetsToItems(boxSheets, cutCfg.W, cutCfg.H).map((it, i) => ({ ...it, label: boxTestLabel(i), fileName: `essai-boite-${i + 1}` }))], [sheets, boxSheets, cutCfg]);
  const machine = useLaserMachine(items, { W: cutCfg.W, H: cutCfg.H });
  /** Planche « Essai boîte » (deux plaques à crans) : choisit le programme (la première planche après celles du nichoir). */
  const boxTest: BoxTest = { available: boxSheets.length > 0, select: () => { machine.setItemIndex(sheets.length); } };
  return { cutCfg, setCutCfg, cutView, setCutView, sheets, preview, machine, boxTest };
}
