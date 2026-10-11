import { useEffect, type MutableRefObject } from 'react';
import type { View } from '@/birdhouse/three/types';

/** Donne la vitesse du ventilateur (0–100 %) à la vue : le rotor tourne dans la boucle de rendu, proportionnellement. */
export function useFanSpeed(view: MutableRefObject<View | null>, pct: number): void {
  useEffect(() => { const v = view.current; if (v) v.fan.pct = pct; }, [view, pct]);
}
