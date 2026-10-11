import { useEffect, type MutableRefObject } from 'react';
import { Color } from 'three';
import { AMBIENCE } from '@/birdhouse/three/constants';
import type { View } from '@/birdhouse/three/types';

/** Jour / nuit du bouton de l'INTERFACE WEB du Pi : la nuit assombrit aussi la vue 3D générale (pour voir l'infrarouge simulé), rend les faisceaux infrarouges pleinement visibles et s'applique aux prises de vue des caméras. */
export function useDayNight(view: MutableRefObject<View | null>, night: boolean) {
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const a = night ? AMBIENCE.night : AMBIENCE.day;
    v.scene.background = new Color(a.background);
    v.ambient.color.set(a.ambient);
    v.ambient.intensity = a.ambientI;
    v.sun.color.set(a.sun);
    v.sun.intensity = a.sunI;
    v.ir.setNight(night);
  }, [view, night]);
}
