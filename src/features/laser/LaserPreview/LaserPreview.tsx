import { Sheet2D } from '@/ui';
import { SHEET_GAP_PREVIEW } from '../constants';
import type { CutCfg, Sheets } from '../types';

/** Aperçu des planches à découper, posé par-dessus la vue 3D. */
export function LaserPreview({ svg, cutCfg, sheets }: { svg: string; cutCfg: CutCfg; sheets: Sheets }) {
  return <Sheet2D svg={svg} width={cutCfg.W} height={sheets.length * (cutCfg.H + SHEET_GAP_PREVIEW)} />;
}
