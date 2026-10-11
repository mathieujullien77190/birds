import { useEffect, type MutableRefObject } from 'react';
import { Color } from 'three';
import { AMBIENCE } from '@/birdhouse/three/constants';
import type { View } from '@/birdhouse/three/types';

/** Applique l'ambiance jour / nuit à la scène (fond et lumières). Les caméras du simulateur du Pi voient la même scène : la nuit elle est sombre. */
export function useDayNight(view: MutableRefObject<View | null>, night: boolean) {
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const a = night ? AMBIENCE.night : AMBIENCE.day;
    v.scene.background = new Color(a.background);
    v.ambient.color.set(a.ambient); v.ambient.intensity = a.ambientI;
    v.sun.color.set(a.sun); v.sun.intensity = a.sunI;
    v.ir.setNight(night); // les faisceaux infrarouges sont plus discrets de jour
  }, [view, night]);
}
