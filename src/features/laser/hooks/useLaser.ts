import { useMemo, useState } from 'react';
import { nestSheets, sheetsPreviewSvg, type PlankScene } from '@/planks/model';
import { usePersistentState } from '@/hooks';
import { CUT_CFG_KEY } from '../constants';
import { parseCutCfg } from '../helpers';
import { useLaserMachine } from './useLaserMachine';

/** Découpe laser : réglages de la planche (gardés), rangement des pièces par planche, aperçu SVG, choix « 3D / planches » et pilotage de la machine. */
export function useLaser(sc: PlankScene) {
  const [cutCfg, setCutCfg] = usePersistentState(CUT_CFG_KEY, parseCutCfg);
  const [cutView, setCutView] = useState(false); // aperçu des planches à la place de la 3D
  const sheets = useMemo(() => nestSheets(sc, cutCfg.W, cutCfg.H, cutCfg.gap), [sc, cutCfg]);
  const preview = useMemo(() => sheetsPreviewSvg(sheets, cutCfg.W, cutCfg.H), [sheets, cutCfg]);
  const machine = useLaserMachine(sheets, cutCfg);
  return { cutCfg, setCutCfg, cutView, setCutView, sheets, preview, machine };
}
