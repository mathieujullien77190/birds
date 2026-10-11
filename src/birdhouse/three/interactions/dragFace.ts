import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { Vector3 } from 'three';
import { pullFace, type FaceAxis, type PlankScene } from '../../model';
import type { View } from '../types';
import { listen } from './listen';
import type { Picker } from './picking';

export interface DragFaceDeps {
  view: View;
  picker: Picker;
  scRef: MutableRefObject<PlankScene>;
  pullRef: MutableRefObject<{ plankId: string; axis: FaceAxis; sign: 1 | -1 } | null>;
  setSc: Dispatch<SetStateAction<PlankScene>>;
  pushEntry: (label: string) => void;
}

/**
 * Tirer une face : après un double-clic sur une face (`pullRef`), un glissé dessus la déplace le long de sa normale (au millimètre) ;
 * la plaque et ce qui lui est connecté suivent (`pullFace`). Une entrée d'historique « Face tirée » au début du glissé. Renvoie la désinscription.
 */
export function attachDragFace({ view: v, picker, scRef, pullRef, setSc, pushEntry }: DragFaceDeps): () => void {
  const el = v.renderer.domElement;
  let drag: { total: number; s0: number; P0: Vector3; N: Vector3 } | null = null;
  const onDown = (e: PointerEvent) => {
    const pl = pullRef.current;
    if (e.button !== 0 || !pl) return;
    picker.rayAt(e);
    const first = picker.firstPlank();
    if (!first || first.mesh.plankId !== pl.plankId) return;
    const m = v.meshes.get(pl.plankId);
    const p = scRef.current.planks.find((x) => x.id === pl.plankId);
    if (!m || !p) return;
    const N = new Vector3(pl.axis === 'x' ? 1 : 0, pl.axis === 'y' ? 1 : 0, pl.axis === 'z' ? 1 : 0).multiplyScalar(pl.sign).applyQuaternion(m.quaternion).normalize();
    const half = pl.axis === 'x' ? p.w / 2 : pl.axis === 'y' ? p.h / 2 : scRef.current.t / 2;
    const P0 = m.position.clone().addScaledVector(N, half);
    const s0 = picker.lineParam(P0, N);
    if (s0 === null) return;
    drag = { total: 0, s0, P0, N };
    v.orbit.enabled = false; v.dragging = true;
    el.setPointerCapture(e.pointerId);
    pushEntry('Face tirée');
    e.stopImmediatePropagation();
  };
  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    picker.rayAt(e);
    const sNow = picker.lineParam(drag.P0, drag.N);
    if (sNow === null) return;
    const want = Math.round(sNow - drag.s0); // au millimètre
    const inc = want - drag.total;
    if (!inc) return;
    const pl = pullRef.current;
    if (!pl) return;
    const { scene: n, applied } = pullFace(scRef.current, pl.plankId, pl.axis, pl.sign, inc);
    drag.total += applied;
    if (applied) { scRef.current = n; setSc(n); }
  };
  const onUp = () => { if (!drag) return; drag = null; v.orbit.enabled = true; setTimeout(() => { v.dragging = false; }, 0); };
  const offs = [listen(el, 'pointerdown', onDown, true), listen(el, 'pointermove', onMove), listen(el, 'pointerup', onUp)];
  return () => offs.forEach((off) => off());
}
