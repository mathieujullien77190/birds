import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { Vector3 } from 'three';
import { AXIS_N, type Cut, type View } from '../types';
import { listen } from './listen';
import type { Picker } from './picking';

export interface DragCutDeps {
  view: View;
  picker: Picker;
  cutRef: MutableRefObject<Cut>;
  setCut: Dispatch<SetStateAction<Cut>>;
}

/** Glisser le plan de coupe le long de son axe (au millimètre) ; une plaque plus proche que le plan garde la priorité. Renvoie la désinscription. */
export function attachDragCut({ view: v, picker, cutRef, setCut }: DragCutDeps): () => void {
  const el = v.renderer.domElement;
  let drag: { s0: number; pos0: number; P0: Vector3; N: Vector3 } | null = null;
  const onDown = (e: PointerEvent) => {
    const c = cutRef.current;
    if (e.button !== 0 || !c.on) return;
    picker.rayAt(e);
    const hit = picker.firstHit(v.cutMark.children);
    if (!hit) return;
    const plankHit = picker.firstPlank();
    if (plankHit && plankHit.hit.distance < hit.distance - 0.5) return; // une plaque devant le plan : on la laisse
    const N = AXIS_N[c.axis].clone();
    const s0 = picker.lineParam(hit.point.clone(), N);
    if (s0 === null) return;
    drag = { s0, pos0: c.pos, P0: hit.point.clone(), N };
    v.orbit.enabled = false; v.dragging = true;
    el.setPointerCapture(e.pointerId);
    e.stopImmediatePropagation();
  };
  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    picker.rayAt(e);
    const sNow = picker.lineParam(drag.P0, drag.N);
    if (sNow === null) return;
    const pos = Math.round(drag.pos0 + sNow - drag.s0);
    setCut((c) => (c.pos === pos ? c : { ...c, pos }));
  };
  const onUp = () => { if (!drag) return; drag = null; v.orbit.enabled = true; setTimeout(() => { v.dragging = false; }, 0); };
  const offs = [listen(el, 'pointerdown', onDown, true), listen(el, 'pointermove', onMove), listen(el, 'pointerup', onUp)];
  return () => offs.forEach((off) => off());
}
