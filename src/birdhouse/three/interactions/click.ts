import type { MutableRefObject } from 'react';
import type { View } from '../types';
import { listen } from './listen';
import type { Picker } from './picking';

export interface ClickDeps {
  view: View;
  picker: Picker;
  pickRef: MutableRefObject<(id: string | null, ctrl: boolean) => void>;
  setCtx: (c: { x: number; y: number; plankId: string; local: [number, number] } | null) => void;
  setSelectedId: (id: string | null) => void;
}

/** Seuil (pixels) au-delà duquel un appui suivi d'un relâchement est un glissé, pas un clic. */
const CLICK_SLOP = 4;

/**
 * Un clic (sans glissé) choisit une plaque, dans le vide désélectionne ; Ctrl / Cmd = sélection multiple ;
 * un clic droit sur une plaque ouvre le menu contextuel avec le point touché en coordonnées de la plaque. Renvoie la désinscription.
 */
export function attachClick({ view: v, picker, pickRef, setCtx, setSelectedId }: ClickDeps): () => void {
  const el = v.renderer.domElement;
  let down: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: PointerEvent) => {
    if (!down || v.dragging || Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_SLOP || (e.button !== 0 && e.button !== 2)) { down = null; return; }
    down = null;
    const r = el.getBoundingClientRect();
    picker.rayAt(e);
    const first = picker.firstPlank();
    const id = first ? first.mesh.plankId : null;
    if (e.button === 2) { // clic droit sur une plaque : menu, avec le point touché en coordonnées de la plaque
      if (first && id) { const local = first.mesh.worldToLocal(first.hit.point.clone()); setSelectedId(id); setCtx({ x: e.clientX - r.left, y: e.clientY - r.top, plankId: id, local: [local.x, local.y] }); }
      else setCtx(null);
      return;
    }
    setCtx(null);
    pickRef.current(id, e.ctrlKey || e.metaKey);
  };
  const offs = [listen(el, 'pointerdown', onDown), listen(el, 'pointerup', onUp), listen(el, 'contextmenu', (e) => e.preventDefault())];
  return () => offs.forEach((off) => off());
}
