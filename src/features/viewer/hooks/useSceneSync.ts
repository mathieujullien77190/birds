import { useEffect, type MutableRefObject } from 'react';
import { MathUtils, Plane } from 'three';
import type { FaceAxis, PlankScene } from '@/birdhouse/model';
import { EMISSIVE } from '@/birdhouse/three/constants';
import { clearGroup, disposeObject3D } from '@/birdhouse/three/dispose';
import { cutMarkObject, habillageDimensions, holeMarkObjects, pullMarkObject } from '@/birdhouse/three/factories/marks';
import { createPlankMesh } from '@/birdhouse/three/factories/plank';
import { AXIS_N, type Cut, type View } from '@/birdhouse/three/types';

export interface SceneSyncState {
  sc: PlankScene;
  selectedId: string | null;
  extra: Set<string>;
  hover: { plank?: string; group?: string } | null;
  groupSel: string | null;
  holeEdit: { plankId: string; holeId: string; fresh?: boolean } | null;
  holeHover: { plankId: string; holeId: string } | null;
  pull: { plankId: string; axis: FaceAxis; sign: 1 | -1 } | null;
  cut: Cut;
  hidden: Set<string>;
  piReady: boolean;
}

/**
 * L'état → la scène, en effets séparés (chacun ne se refait que si SES entrées changent, dans cet ordre) :
 * 1. les meshes (une par plaque : forme, position, rotation, transparence ; les plaques supprimées sont libérées) ;
 * 2. la surbrillance (sélection, survol) ; 3. la coupe et la visibilité ; 4–7. les repères (trou, face tirée, plan de coupe) et les cotes de l'habillage.
 */
export function useSceneSync(view: MutableRefObject<View | null>, { sc, selectedId, extra, hover, groupSel, holeEdit, holeHover, pull, cut, hidden, piReady }: SceneSyncState) {
  // 1. une mesh par plaque, géométrie refaite si la forme change, position / rotation recopiées
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const seen = new Set<string>();
    for (const p of sc.planks) {
      if (p.special === 'doc') continue; // document : rien à dessiner dans la 3D
      seen.add(p.id);
      let m = v.meshes.get(p.id);
      if (!m) {
        m = createPlankMesh(p, sc.t);
        v.scene.add(m);
        v.meshes.set(p.id, m);
      } else m.updateShape(p, sc.t); // la géométrie n'est refaite que si la forme a changé
      m.position.set(...p.pos);
      m.rotation.set(MathUtils.degToRad(p.rot[0]), MathUtils.degToRad(p.rot[1]), MathUtils.degToRad(p.rot[2]));
      const mat = m.material;
      m.setOak(p.name === 'Toit en chêne'); // le pan de toit en chêne porte une texture de bois (le reste garde ses couleurs par sommets)
      mat.transparent = !!p.transparent;
      mat.opacity = p.transparent ? 0.3 : 1;
      mat.depthWrite = !p.transparent;
      mat.needsUpdate = true;
    }
    for (const [id, m] of v.meshes) if (!seen.has(id)) { v.scene.remove(m); disposeObject3D(m); v.meshes.delete(id); } // plaque supprimée : géométrie, arêtes et matériau libérés
  }, [view, sc, piReady]);

  // 2. surbrillance : survolé (ambre), choisi (vert), sélection multiple (bleu)
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    for (const p of sc.planks) {
      const m = v.meshes.get(p.id);
      if (!m) continue;
      const mat = m.material;
      const hovered = !!hover && (hover.plank === p.id || (!!hover.group && hover.group === p.group));
      const chosen = groupSel ? p.group === groupSel : p.id === selectedId; // boîte choisie : toutes ses plaques
      mat.emissive.set(hovered ? EMISSIVE.hover : chosen ? EMISSIVE.chosen : extra.has(p.id) ? EMISSIVE.extra : EMISSIVE.none); // survolé dans la liste : ambre
      mat.emissiveIntensity = hovered ? EMISSIVE.hoverIntensity : EMISSIVE.baseIntensity;
    }
  }, [view, sc, selectedId, extra, hover, groupSel]);

  // 3. plan de coupe (le côté « devant » est gardé, l'autre devient invisible) et plaques cachées (hors de la couche 0 : ni dessinées ni touchées par les clics)
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const clipPlanes = cut.on ? [new Plane(AXIS_N[cut.axis].clone().multiplyScalar(cut.flip ? -1 : 1), cut.flip ? cut.pos : -cut.pos)] : null;
    for (const p of sc.planks) {
      const m = v.meshes.get(p.id);
      if (!m) continue;
      m.material.clippingPlanes = clipPlanes;
      m.material.needsUpdate = true;
      const isHidden = hidden.has(p.id);
      m.visible = !isHidden;
      m.layers.set(isHidden ? 1 : 0);
      m.edges.material.clippingPlanes = clipPlanes;
    }
  }, [view, sc, cut, hidden]);

  // 4. trou en cours de réglage (ou survolé) : son contour en pointillés et ses cotes, sur la plaque
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    clearGroup(v.holeMark);
    const mark = holeEdit ?? holeHover;
    const mp = mark ? sc.planks.find((p) => p.id === mark.plankId) : undefined;
    const mh = mark ? mp?.holes.find((h) => h.id === mark.holeId) : undefined;
    const mm = mp ? v.meshes.get(mp.id) : undefined;
    if (!mp || !mh || !mm) return;
    v.holeMark.add(...holeMarkObjects(mp, mh, sc.t));
    v.holeMark.position.copy(mm.position);
    v.holeMark.quaternion.copy(mm.quaternion);
  }, [view, sc, holeEdit, holeHover]);

  // 5. face à tirer : son contour en pointillés bleus
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    clearGroup(v.pullMark);
    const pp = pull ? sc.planks.find((x) => x.id === pull.plankId) : undefined;
    const pm = pp ? v.meshes.get(pp.id) : undefined;
    if (!pp || !pm || !pull) return;
    v.pullMark.add(pullMarkObject(pp, pull, sc.t));
    v.pullMark.position.copy(pm.position);
    v.pullMark.quaternion.copy(pm.quaternion);
  }, [view, sc, pull]);

  // 6. plan de coupe : un grand carré bleu transparent, à la position réglée
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    clearGroup(v.cutMark);
    const quad = cutMarkObject(sc.planks, sc.t, cut);
    if (quad) v.cutMark.add(quad);
  }, [view, sc, cut]);

  // 7. cotes de l'habillage
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    clearGroup(v.labels);
    v.labels.add(...habillageDimensions(sc, hidden));
  }, [view, sc, hidden]);
}
