import { useEffect, useRef } from 'react';
import type { GcodeJob } from '../grbl';
import { currentSegment } from '../components/GcodePreview/helpers';
import type { JobView } from './useGcodeJob';

/** Où en est l'envoi : le segment que la tête parcourt (jamais en arrière pendant un envoi) et le temps restant d'après ce segment. `null` hors envoi. */
export interface JobProgress { segment: number; remaining: number }

/**
 * Suivi de l'envoi d'après la position réelle de la tête (`head`) : la machine garde beaucoup de lignes d'avance, les lignes acceptées ne disent pas où l'on en est.
 * Une fois l'envoi terminé, tout est fait (reste 0). Hors envoi de coupe ou d'essai : `null`.
 */
export function useJobProgress(view: JobView, program: GcodeJob | null, head?: { x: number; y: number }): JobProgress | null {
  const k = useRef(0);
  const tracked = !!view.snap && (view.kind === 'cut' || view.kind === 'test') && !!program?.segLines;
  useEffect(() => { if (!tracked) k.current = 0; }, [tracked, program]);
  if (!tracked || !program?.segLines || !view.snap) return null;
  if (view.snap.phase === 'done') return { segment: program.segments.length, remaining: 0 };
  k.current = Math.max(k.current, currentSegment(program.segments, program.segLines, view.snap.acked, head, k.current));
  const line = program.segLines[k.current];
  const doneS = line === undefined ? 0 : program.lineTimes[Math.max(0, line - 1)] ?? 0;
  return { segment: k.current, remaining: Math.max(0, program.stats.seconds - doneS) };
}
