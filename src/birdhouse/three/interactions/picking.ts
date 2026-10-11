import { Raycaster, Vector2, Vector3, type Intersection } from 'three';
import { isPlankMesh, type PlankMesh } from '../factories/plank';
import type { View } from '../types';

/** Un rayon de la souris dans la scène : un seul Raycaster, réutilisé par toutes les interactions. */
export interface Picker {
  readonly ray: Raycaster;
  /** Oriente le rayon vers le point de l'écran où se trouve la souris. */
  rayAt(e: PointerEvent): void;
  /** Paramètre du point de la droite (P0, N) le plus proche du rayon souris (null si le rayon lui est presque parallèle). */
  lineParam(P0: Vector3, N: Vector3): number | null;
  /** Première plaque touchée par le rayon courant (`onlyVisible` : ignore les plaques cachées). */
  firstPlank(onlyVisible?: boolean): { mesh: PlankMesh; hit: Intersection } | null;
  /** Premier objet quelconque touché parmi `objects`. */
  firstHit(objects: View['cutMark']['children']): Intersection | undefined;
}

export function createPicker(v: View): Picker {
  const ray = new Raycaster();
  const rayAt = (e: PointerEvent) => {
    const r = v.renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), v.camera);
  };
  const lineParam = (P0: Vector3, N: Vector3): number | null => {
    const o = ray.ray.origin, r = ray.ray.direction, w0 = o.clone().sub(P0);
    const b = r.dot(N), dd = r.dot(w0), ee = N.dot(w0), den = 1 - b * b;
    if (Math.abs(den) < 1e-4) return null;
    return (ee - b * dd) / den;
  };
  const firstPlank = (onlyVisible = false) => {
    const meshes = onlyVisible ? [...v.meshes.values()].filter((m) => m.visible) : [...v.meshes.values()];
    const hit = ray.intersectObjects(meshes, false)[0];
    return hit && isPlankMesh(hit.object) ? { mesh: hit.object, hit } : null;
  };
  const firstHit = (objects: View['cutMark']['children']) => ray.intersectObjects(objects, false)[0];
  return { ray, rayAt, lineParam, firstPlank, firstHit };
}
