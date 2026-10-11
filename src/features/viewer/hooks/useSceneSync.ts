import { useEffect, type MutableRefObject } from 'react';
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Line, LineBasicMaterial, LineLoop, LineSegments, MathUtils, Mesh, MeshStandardMaterial, Plane, PlaneGeometry, Sprite, Vector3 } from 'three';
import { bounds, extents, holeOutline, outline, type PlankScene, type Vec3 } from '@/birdhouse/model';
import { dimension } from '@/birdhouse/three/dimensions';
import { oakTexture } from '@/birdhouse/three/oakTexture';
import { piModel } from '@/birdhouse/three/piModel';
import { plankGeometry } from '@/birdhouse/three/plankGeometry';
import { AXIS_I, AXIS_N, CUT_MAT, HOLE_MARK, PULL_MARK, type Cut, type View } from '@/birdhouse/three/types';
import type { FaceAxis } from '@/birdhouse/model';

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

/** L'état → la scène : une mesh par plaque, géométrie refaite si la forme change, position / rotation recopiées, repères (trou, face tirée, plan de coupe, cotes de l'habillage). */
export function useSceneSync(view: MutableRefObject<View | null>, { sc, selectedId, extra, hover, groupSel, holeEdit, holeHover, pull, cut, hidden, piReady }: SceneSyncState) {
  // l'état → la scène : une mesh par plaque, géométrie refaite si la forme change, position / rotation recopiées (sauf pendant un glissé)
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const seen = new Set<string>();
    const clipPlanes = cut.on ? [new Plane(AXIS_N[cut.axis].clone().multiplyScalar(cut.flip ? -1 : 1), cut.flip ? cut.pos : -cut.pos)] : null; // le côté « devant » est gardé, l'autre devient invisible
    for (const p of sc.planks) {
      if (p.special === 'doc') continue; // document : rien à dessiner dans la 3D
      seen.add(p.id);
      let m = v.meshes.get(p.id);
      const key = JSON.stringify([p.w, p.h, p.notches, p.holes, sc.t, p.path, p.depth, p.special === 'pi' && !!piModel]); // tout ce qui change la forme : dimensions, crans, trous, épaisseur
      if (!m) {
        m = new Mesh(new BufferGeometry(), new MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.85, side: DoubleSide }));
        m.userData.id = p.id;
        m.add(new LineSegments(new BufferGeometry(), new LineBasicMaterial({ color: '#4a3014' })));
        v.scene.add(m);
        v.meshes.set(p.id, m);
      }
      if (m.userData.key !== key) {
        const { geo, edges } = plankGeometry(p, sc.t);
        m.geometry.dispose();
        m.geometry = geo;
        const lines = m.children[0] as LineSegments;
        lines.geometry.dispose();
        lines.geometry = edges;
        m.userData.key = key;
      }
      m.position.set(...p.pos);
      m.rotation.set(...(p.rot.map(MathUtils.degToRad) as Vec3));
      const mat = m.material as MeshStandardMaterial;
      const hovered = !!hover && (hover.plank === p.id || (!!hover.group && hover.group === p.group));
      const chosen = groupSel ? p.group === groupSel : p.id === selectedId; // boîte choisie : toutes ses plaques
      mat.emissive.set(hovered ? '#d97706' : chosen ? '#3d6f5a' : extra.has(p.id) ? '#2f5f8a' : '#000000'); // survolé dans la liste : ambre
      mat.emissiveIntensity = hovered ? 0.5 : 0.35;
      if (p.name === 'Toit en chêne') { if (!mat.map) { mat.map = oakTexture(); mat.vertexColors = false; mat.color.set('#ffffff'); mat.roughness = 0.7; mat.needsUpdate = true; } } // le pan de toit en chêne porte une texture de bois (le reste garde ses couleurs par sommets)
      mat.transparent = !!p.transparent;
      mat.opacity = p.transparent ? 0.3 : 1;
      mat.depthWrite = !p.transparent;
      mat.needsUpdate = true;
      mat.clippingPlanes = clipPlanes;
      const isHidden = hidden.has(p.id);
      m.visible = !isHidden;
      m.layers.set(isHidden ? 1 : 0); // hors de la couche 0 : ni dessinée ni touchée par les clics
      ((m.children[0] as LineSegments).material as LineBasicMaterial).clippingPlanes = clipPlanes;
    }
    for (const [id, m] of v.meshes) if (!seen.has(id)) { v.scene.remove(m); m.geometry.dispose(); v.meshes.delete(id); }
    // ronds de coin : sur l'élément choisi (vert, à tirer) et sur toutes les autres pièces (bleu à 50 %, cibles d'aimantation, visibles pendant le glissé)
    for (const g of [v.handles, v.targets]) for (const o of [...g.children]) g.remove(o);
    v.handles.visible = false; // plus de ronds de coin : on ne déplace plus les pièces à la souris (retirés à la demande de l'utilisateur)
    // trou en cours de réglage (ou survolé) : son contour en pointillés sur les deux faces de la plaque
    for (const o of [...v.holeMark.children]) { v.holeMark.remove(o); o.traverse((c) => { const sp = c as Sprite; if (sp.isSprite) { sp.material.map?.dispose(); sp.material.dispose(); } else (c as Line).geometry?.dispose(); }); }
    const mark = holeEdit ?? holeHover;
    const mp = mark ? sc.planks.find((p) => p.id === mark.plankId) : undefined;
    const mh = mp?.holes.find((h) => h.id === mark!.holeId);
    const mm = mp ? v.meshes.get(mp.id) : undefined;
    if (mp && mh && mm) {
      const loop = holeOutline(mh);
      for (const z of [-sc.t / 2 - 0.3, sc.t / 2 + 0.3]) {
        const geo = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(loop.flatMap(([x, y]) => [x, y, z]), 3));
        const line = new LineLoop(geo, HOLE_MARK);
        line.computeLineDistances();
        line.renderOrder = 25;
        v.holeMark.add(line);
      }
      // cotes : du bord de la plaque au bord du trou, des quatre côtés, dans le plan de la face avant
      const hw = mh.shape === 'square' ? mh.size / 2 : mh.size / 2, hh = mh.shape === 'square' ? (mh.sh ?? mh.size) / 2 : mh.size / 2;
      const z = sc.t / 2 + 0.6, X = new Vector3(1, 0, 0), Yv = new Vector3(0, 1, 0), none = new Vector3();
      const r1 = (v: number) => `${+v.toFixed(2)}`; // valeur exacte au centième, sans zéros inutiles
      v.holeMark.add(
        dimension(new Vector3(-mp.w / 2, mh.y, z), new Vector3(mh.x - hw, mh.y, z), Yv, none, r1(mh.x - hw + mp.w / 2)), // gauche
        dimension(new Vector3(mh.x + hw, mh.y, z), new Vector3(mp.w / 2, mh.y, z), Yv, none, r1(mp.w / 2 - mh.x - hw)), // droite
        dimension(new Vector3(mh.x, mh.y + hh, z), new Vector3(mh.x, mp.h / 2, z), X, none, r1(mp.h / 2 - mh.y - hh)), // haut
        dimension(new Vector3(mh.x, -mp.h / 2, z), new Vector3(mh.x, mh.y - hh, z), X, none, r1(mh.y - hh + mp.h / 2)), // bas
      );
      v.holeMark.position.copy(mm.position);
      v.holeMark.quaternion.copy(mm.quaternion);
    }
    // face à tirer : son contour en pointillés bleus
    for (const o of [...v.pullMark.children]) { v.pullMark.remove(o); (o as Line).geometry.dispose(); }
    const pp = pull ? sc.planks.find((x) => x.id === pull.plankId) : undefined;
    const pm = pp ? v.meshes.get(pp.id) : undefined;
    if (pp && pm && pull) {
      const t2 = sc.t / 2 + 0.3, w2 = pp.w / 2 + 0.3, h2 = pp.h / 2 + 0.3;
      let loop: number[];
      if (pull.axis === 'z') { const z = pull.sign * t2; loop = outline(pp).flatMap(([x, y]) => [x, y, z]); }
      else if (pull.axis === 'x') { const x = pull.sign * w2; loop = [x, -h2, -t2, x, h2, -t2, x, h2, t2, x, -h2, t2]; }
      else { const y = pull.sign * h2; loop = [-w2, y, -t2, w2, y, -t2, w2, y, t2, -w2, y, t2]; }
      const line = new LineLoop(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(loop, 3)), PULL_MARK);
      line.computeLineDistances();
      line.renderOrder = 26;
      v.pullMark.add(line);
      v.pullMark.position.copy(pm.position);
      v.pullMark.quaternion.copy(pm.quaternion);
    }
    // plan de coupe : un grand carré bleu transparent, à la position réglée
    for (const o of [...v.cutMark.children]) { v.cutMark.remove(o); (o as Mesh).geometry.dispose(); }
    if (cut.on && sc.planks.length) {
      const { min, max } = bounds(sc.planks, sc.t);
      const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 50) * 1.4;
      const quad = new Mesh(new PlaneGeometry(size, size), CUT_MAT);
      const n = AXIS_N[cut.axis];
      quad.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), n);
      quad.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
      quad.position.setComponent(AXIS_I[cut.axis], cut.pos);
      quad.renderOrder = 5;
      v.cutMark.add(quad);
    }
    // cotes : traits le long des côtés de chaque composant de plus haut niveau (plaque seule : largeur et hauteur dans son plan ; groupe : l, L, H de son encombrement)
    for (const o of [...v.labels.children]) { v.labels.remove(o); o.traverse((c) => { const sp = c as Sprite; if (sp.isSprite) { sp.material.map?.dispose(); sp.material.dispose(); } else (c as Mesh).geometry?.dispose(); }); }
    { // cotes de l'HABILLAGE seulement (demande de l'utilisateur : plus de bouton « Mesures », plus de cotes sur les autres pièces) : l × L × H de son encombrement
      const O = 14; // écart entre l'objet et la cote
      const done = new Set<string>();
      for (const p of sc.planks) {
        if (p.group && (sc.groupNames?.[p.group] ?? '').startsWith('Habillage')) {
          if (done.has(p.group)) continue;
          done.add(p.group);
          const members = sc.planks.filter((x) => x.group === p.group && !hidden.has(x.id));
          if (!members.length) continue;
          const { min, max } = bounds(members, sc.t);
          const [l, L, H] = extents(members, sc.t);
          const X = new Vector3(1, 0, 0), Yn = new Vector3(0, -1, 0);
          v.labels.add(
            dimension(new Vector3(min[0], min[1] - O, min[2]), new Vector3(max[0], min[1] - O, min[2]), Yn, Yn.clone().multiplyScalar(O), `${l}`), // largeur, devant (−y), au sol
            dimension(new Vector3(max[0] + O, min[1], min[2]), new Vector3(max[0] + O, max[1], min[2]), X, X.clone().multiplyScalar(O), `${L}`), // profondeur, à droite, au sol
            dimension(new Vector3(max[0] + O, min[1] - O, min[2]), new Vector3(max[0] + O, min[1] - O, max[2]), X, new Vector3(O, -O, 0), `${H}`), // hauteur, sur l'arête avant droite
          );
        }
      }
    }
  }, [sc, selectedId, extra, hover, groupSel, holeEdit, holeHover, pull, cut, hidden, piReady]); // eslint-disable-line react-hooks/exhaustive-deps
}
