import { useEffect, type MutableRefObject } from 'react';
import type { View } from '@/birdhouse/three/types';

/** Jour / nuit de l'INTERFACE WEB du Pi : la vue 3D reste de jour ; la nuit n'assombrit que ce que voient les caméras du simulateur (`CameraShooter.lights`) et rend les faisceaux infrarouges pleinement visibles. */
export function useDayNight(view: MutableRefObject<View | null>, night: boolean) {
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.ir.setNight(night); // les faisceaux infrarouges sont plus discrets de jour
  }, [view, night]);
}
