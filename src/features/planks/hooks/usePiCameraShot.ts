import { useRef, type MutableRefObject } from 'react';
import type { PlankScene } from '@/planks/model';
import { shootCamera } from '@/planks/three/cameraShot';
import type { View } from '@/planks/three/types';

/** Flux vidéo du simulateur du Pi : la scène 3D vue depuis l'objectif de la caméra 1 (dans le nid, en infrarouge) ou 2 (dehors). `null` si la carte n'existe pas. */
export function usePiCameraShot(view: MutableRefObject<View | null>, scRef: MutableRefObject<PlankScene>, night: boolean) {
  const nightRef = useRef(night);
  nightRef.current = night; // le simulateur garde la première fonction : on lit l'état courant par la ref
  /** `led` : LED infrarouges de cette caméra allumées → vision nocturne en noir et blanc, scène éclairée par les LED. */
  return (num: number, led = false): string | null => {
    const v = view.current;
    const p = scRef.current.planks.find((x) => x.special === 'camera' && (num === 0 ? x.name === 'Caméra' : x.name === 'Caméra 2'));
    const m = p && v?.meshes.get(p.id);
    return v && m ? shootCamera(v, m, num === 0 ? (led ? 'CAM1 (nid, IR)' : 'CAM1 (nid)') : (led ? 'CAM2 (entrée, IR)' : 'CAM2 (entrée)'), { gray: led, ir: led, night: nightRef.current, fov: num === 0 ? 80 : 66, level: num === 1 }) : null;
  };
}
