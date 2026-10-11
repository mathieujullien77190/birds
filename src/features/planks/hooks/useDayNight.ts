import { useEffect, type MutableRefObject } from 'react';
import { Color } from 'three';
import type { View } from '@/planks/three/types';

/** Ambiances de la vue 3D : le jour (ciel clair, soleil) et la nuit (fond sombre, faible lumière bleutée de lune). */
const AMBIENCE = {
  day: { background: '#eef2f1', ambient: '#ffffff', ambientI: 1.1, sun: '#ffffff', sunI: 1.8 },
  night: { background: '#070b14', ambient: '#8aa4ff', ambientI: 0.16, sun: '#9db4ff', sunI: 0.35 },
} as const;

/** Applique l'ambiance jour / nuit à la scène (fond et lumières). Les caméras du simulateur du Pi voient la même scène : la nuit elle est sombre. */
export function useDayNight(view: MutableRefObject<View | null>, night: boolean) {
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const a = night ? AMBIENCE.night : AMBIENCE.day;
    v.scene.background = new Color(a.background);
    v.ambient.color.set(a.ambient); v.ambient.intensity = a.ambientI;
    v.sun.color.set(a.sun); v.sun.intensity = a.sunI;
  }, [view, night]);
}
