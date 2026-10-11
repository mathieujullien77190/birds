import { useMemo, useState } from 'react';
import { nestSheets, sheetsPreviewSvg, type PlankScene } from '@/birdhouse/model';
import { usePersistentState } from '@/hooks';
import { useLaserMachine } from '@laser';
import { sheetsToItems } from '../adapter';
import { CUT_CFG_KEY } from '../constants';
import { parseCutCfg } from '../helpers';

/** Découpe laser : réglages de la planche (gardés), rangement des pièces par planche, aperçu SVG, choix « 3D / planches » et pilotage de la machine (laser-control). */
export function useLaser(sc: PlankScene) {
  const [cutCfg, setCutCfg] = usePersistentState(CUT_CFG_KEY, parseCutCfg);
  const [cutView, setCutView] = useState(false); // aperçu des planches à la place de la 3D
  const sheets = useMemo(() => nestSheets(sc, cutCfg.W, cutCfg.H, cutCfg.gap), [sc, cutCfg]);
  const preview = useMemo(() => sheetsPreviewSvg(sheets, cutCfg.W, cutCfg.H), [sheets, cutCfg]);
  const items = useMemo(() => sheetsToItems(sheets, cutCfg.W, cutCfg.H), [sheets, cutCfg]);
  const machine = useLaserMachine(items, { W: cutCfg.W, H: cutCfg.H });
  return { cutCfg, setCutCfg, cutView, setCutView, sheets, preview, machine };
}
