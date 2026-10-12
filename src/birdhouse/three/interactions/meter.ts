import { BufferGeometry, Float32BufferAttribute, Group, Line, LineBasicMaterial, Points, PointsMaterial, Vector3, type Material } from 'three';
import type { MutableRefObject } from 'react';
import { PALETTE } from '../registry/palette';
import type { View } from '../types';
import { listen } from './listen';
import type { Picker } from './picking';

/** Mesure en cours ou terminée : distance en mm et écarts le long des trois axes de la scène. */
export interface MeterReading { mm: number; dx: number; dy: number; dz: number; done: boolean }

/** Mesure entre deux points de la scène (mm). `done` : le second point est posé. */
export const meterReading = (a: Vector3, b: Vector3, done: boolean): MeterReading => ({ mm: a.distanceTo(b), dx: Math.abs(b.x - a.x), dy: Math.abs(b.y - a.y), dz: Math.abs(b.z - a.z), done });

/** « 123,4 mm » : un chiffre après la virgule. */
export const formatMm = (n: number): string => `${(Math.round(n * 10) / 10).toString().replace('.', ',')} mm`;

/** Pose du mètre : `on` lu à chaque événement, `reset` remplacé par le contrôleur (efface les points quand l'outil est quitté). */
export interface MeterControl { on: boolean; reset: () => void }

export interface MeterDeps {
  view: View;
  picker: Picker;
  meterRef: MutableRefObject<MeterControl>;
  setReading: (r: MeterReading | null) => void;
}

/** Au-delà de ce nombre de sommets, on n'aimante pas (le modèle 3D du Pi en compte des dizaines de milliers). */
const SNAP_MAX_VERTICES = 8000;
/** Distance (pixels) en deçà de laquelle le point s'aimante à un sommet de la pièce touchée. */
const SNAP_PX = 10;
/** Seuil (pixels) au-delà duquel un appui suivi d'un relâchement est un glissé (la vue tourne), pas un clic. */
const CLICK_SLOP = 4;

/**
 * Mètre ruban : clic sur une pièce = premier point (aimanté au sommet le plus proche à 10 px), second clic = second point et mesure ;
 * un troisième clic recommence. Trait rouge et points par-dessus tout. Les clics ne choisissent plus de plaque tant que l'outil est actif
 * (voir `ClickDeps.blocked`). Renvoie la désinscription.
 */
export function attachMeter({ view: v, picker, meterRef, setReading }: MeterDeps): () => void {
  const el = v.renderer.domElement;
  const group = new Group();
  v.scene.add(group);
  const lineMat = new LineBasicMaterial({ color: PALETTE.meterLine, depthTest: false });
  const pointMat = new PointsMaterial({ color: PALETTE.meterLine, size: 10, sizeAttenuation: false, depthTest: false });
  const hoverMat = new PointsMaterial({ color: PALETTE.meterHover, size: 8, sizeAttenuation: false, depthTest: false });
  const mats: Material[] = [lineMat, pointMat, hoverMat];
  let a: Vector3 | null = null, b: Vector3 | null = null, hover: Vector3 | null = null, down: { x: number; y: number } | null = null;

  const clearGroup = () => { for (const c of [...group.children]) { group.remove(c); (c as Line | Points).geometry.dispose(); } };
  const dots = (pts: Vector3[], mat: Material) => {
    const p = new Points(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(pts.flatMap((q) => [q.x, q.y, q.z]), 3)), mat);
    p.renderOrder = 1000; p.frustumCulled = false; group.add(p);
  };
  /** Redessine : points posés, trait vers le second point (ou vers le survol tant qu'il manque), point de survol. */
  const redraw = () => {
    clearGroup();
    const end = b ?? hover;
    if (a && end) {
      const l = new Line(new BufferGeometry().setFromPoints([a, end]), lineMat);
      l.renderOrder = 999; l.frustumCulled = false; group.add(l);
    }
    const fixed = [a, b].filter((q): q is Vector3 => !!q);
    if (fixed.length) dots(fixed, pointMat);
    if (hover && !b) dots([hover], hoverMat);
  };
  const report = () => { const end = b ?? hover; setReading(a && end ? meterReading(a, end, !!b) : null); };
  const reset = () => { a = b = hover = null; redraw(); report(); };
  meterRef.current.reset = reset;

  /** Point touché par le rayon de la souris : sommet le plus proche à l'écran (≤ 10 px) de la pièce touchée, sinon le point exact. */
  const pick = (e: PointerEvent): Vector3 | null => {
    picker.rayAt(e);
    const first = picker.firstPlank(true);
    if (!first) return null;
    const { mesh, hit } = first, pos = mesh.geometry.attributes.position;
    if (!pos || pos.count > SNAP_MAX_VERTICES) return hit.point.clone();
    const r = el.getBoundingClientRect(), p = new Vector3();
    let best: Vector3 | null = null, bestD = SNAP_PX;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      const s = p.clone().project(v.camera);
      if (s.z > 1) continue;
      const d = Math.hypot((s.x * 0.5 + 0.5) * r.width + r.left - e.clientX, (-s.y * 0.5 + 0.5) * r.height + r.top - e.clientY);
      if (d < bestD) { bestD = d; best = p.clone(); }
    }
    return best ?? hit.point.clone();
  };

  const onMove = (e: PointerEvent) => {
    if (!meterRef.current.on || v.dragging || e.buttons) return;
    hover = pick(e);
    redraw(); report();
  };
  const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: PointerEvent) => {
    const d = down; down = null;
    if (!meterRef.current.on || !d || v.dragging || e.button !== 0 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > CLICK_SLOP) return;
    const p = pick(e);
    if (!p) return;
    if (!a || b) { a = p; b = null; } else b = p;
    hover = null;
    redraw(); report();
  };
  const offs = [listen(el, 'pointermove', onMove), listen(el, 'pointerdown', onDown), listen(el, 'pointerup', onUp)];
  return () => {
    offs.forEach((off) => off());
    clearGroup(); v.scene.remove(group); mats.forEach((m) => m.dispose());
    meterRef.current.reset = () => {};
  };
}
