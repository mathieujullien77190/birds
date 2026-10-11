import type { MutableRefObject } from 'react';
import type { PlankScene } from '../../model';
import type { View } from '../types';
import { listen } from './listen';
import type { Picker } from './picking';

export interface HoverDeps {
  view: View;
  picker: Picker;
  scRef: MutableRefObject<PlankScene>;
  setHover: (h: { plank?: string; group?: string } | null) => void;
}

/** Survol : toute pièce touchée passe en surbrillance (la même que le survol dans « Pièces »), le curseur devient une main. Renvoie la désinscription. */
export function attachHover({ view: v, picker, scRef, setHover }: HoverDeps): () => void {
  const el = v.renderer.domElement;
  let hov: string | null = null;
  const onMove = (e: PointerEvent) => {
    let id: string | null = null;
    if (e.buttons === 0 && !v.dragging) {
      picker.rayAt(e);
      const first = picker.firstPlank(true);
      const pl = first ? scRef.current.planks.find((p) => p.id === first.mesh.plankId) : undefined;
      if (pl) id = pl.id;
    }
    el.style.cursor = id ? 'pointer' : '';
    if (id !== hov) { hov = id; setHover(id ? { plank: id } : null); }
  };
  const onLeave = () => { if (hov) { hov = null; setHover(null); } };
  const offs = [listen(el, 'pointermove', onMove), listen(el, 'pointerleave', onLeave)];
  return () => offs.forEach((off) => off());
}
