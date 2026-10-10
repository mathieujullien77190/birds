import { useRef, type MutableRefObject } from 'react';
import { usePersistentState } from '@/hooks';
import { bounds, type PlankScene } from '@/planks/model';
import { AXIS_I, type Cut } from '@/planks/three/types';
import { STORAGE } from '../constants';

const parseCut = (raw: string | null): Cut => { try { const j = JSON.parse(raw ?? '{}'); return { on: false, axis: j.axis ?? 'y', pos: 0, flip: !!j.flip }; } catch { return { on: false, axis: 'y', pos: 0, flip: false }; } };
const serializeCut = (c: Cut) => JSON.stringify({ axis: c.axis, flip: c.flip });

/** Plan de coupe : état (l'axe et le côté sont gardés), réf pour la vue 3D, et milieu de la scène le long d'un axe (position de départ du plan). */
export function useCutPlane(scRef: MutableRefObject<PlankScene>) {
  const [cut, setCut] = usePersistentState(STORAGE.cut, parseCut, serializeCut);
  const cutRef = useRef(cut);
  cutRef.current = cut;
  const midOf = (axis: Cut['axis']) => { const s = scRef.current; if (!s.planks.length) return 0; const b = bounds(s.planks, s.t); const i = AXIS_I[axis]; return Math.round((b.min[i] + b.max[i]) / 2); };
  return { cut, setCut, cutRef, midOf };
}
