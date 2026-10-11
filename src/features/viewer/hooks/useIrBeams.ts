import { useEffect, type MutableRefObject } from 'react';
import type { PlankScene } from '@/birdhouse/model';
import type { View } from '@/birdhouse/three/types';

/** LED infrarouges allumées dans le simulateur du Pi : celles du nid et celles de l'extérieur (indépendantes des caméras). */
export interface IrLeds { nid: boolean; ext: boolean }

/** Relie les faisceaux aux cartes de LED de la scène (par leur nom) et les allume ou les éteint selon `leds`. À appeler après `useSceneSync` : les meshes existent. */
export function useIrBeams(view: MutableRefObject<View | null>, sc: PlankScene, leds: IrLeds): void {
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const board = (name: string) => { const p = sc.planks.find((q) => q.name === name); return (p && v.meshes.get(p.id)) || null; };
    v.ir.bind('nid', board('LED infrarouges'));
    v.ir.bind('ext', board('LED infrarouges extérieures'));
  }, [view, sc]);
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.ir.set('nid', leds.nid); v.ir.set('ext', leds.ext);
  }, [view, leds.nid, leds.ext]);
}
