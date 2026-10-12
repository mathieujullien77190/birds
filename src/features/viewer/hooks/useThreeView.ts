import { useEffect, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react';
import type { FaceAxis, PlankScene } from '@/birdhouse/model';
import { attachClick } from '@/birdhouse/three/interactions/click';
import { attachDragCut } from '@/birdhouse/three/interactions/dragCut';
import { attachDragFace } from '@/birdhouse/three/interactions/dragFace';
import { attachMeter, type MeterControl, type MeterReading } from '@/birdhouse/three/interactions/meter';
import { attachHover } from '@/birdhouse/three/interactions/hover';
import { createPicker } from '@/birdhouse/three/interactions/picking';
import { createScene } from '@/birdhouse/three/scene/createScene';
import type { Cut, View } from '@/birdhouse/three/types';

/** Ce que la vue 3D lit ou écrit dans le composant : uniquement des refs et des setters stables (l'effet de création ne tourne qu'une fois). */
export interface ThreeViewDeps {
  host: RefObject<HTMLDivElement | null>;
  view: MutableRefObject<View | null>;
  scRef: MutableRefObject<PlankScene>;
  cutRef: MutableRefObject<Cut>;
  pullRef: MutableRefObject<{ plankId: string; axis: FaceAxis; sign: 1 | -1 } | null>;
  pickRef: MutableRefObject<(id: string | null, ctrl: boolean) => void>;
  setSc: Dispatch<SetStateAction<PlankScene>>;
  setCut: Dispatch<SetStateAction<Cut>>;
  setCtx: (c: { x: number; y: number; plankId: string } | null) => void;
  setSelectedId: (id: string | null) => void;
  setHover: (h: { plank?: string; group?: string } | null) => void;
  pushEntry: (label: string) => void;
  meterRef: MutableRefObject<MeterControl>;
  setMeter: (r: MeterReading | null) => void;
}

/**
 * Vue Three.js : crée la scène (`createScene`) et y branche les interactions (glissé du plan de coupe, glissé d'une face, survol, mètre, clic / clic droit) ;
 * à la fermeture, désinscrit les écouteurs puis libère tout. L'ordre d'inscription compte : les glissés (en capture) passent avant le clic.
 */
export function useThreeView({ host, view, scRef, cutRef, pullRef, pickRef, setSc, setCut, setCtx, setSelectedId, setHover, pushEntry, meterRef, setMeter }: ThreeViewDeps) {
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const { view: v, dispose } = createScene(el);
    const picker = createPicker(v);
    const detach = [
      attachDragCut({ view: v, picker, cutRef, setCut }),
      attachDragFace({ view: v, picker, scRef, pullRef, setSc, pushEntry }),
      attachHover({ view: v, picker, scRef, setHover }),
      attachMeter({ view: v, picker, meterRef, setReading: setMeter }),
      attachClick({ view: v, picker, pickRef, setCtx, setSelectedId, blocked: () => meterRef.current.on }),
    ];
    view.current = v;
    return () => { detach.forEach((off) => off()); dispose(); view.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- tout ce qui est lu vient de refs ou de setters stables : la vue n'est créée qu'une fois
}
