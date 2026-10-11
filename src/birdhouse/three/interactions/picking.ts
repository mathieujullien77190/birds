import { Raycaster, TubeGeometry, Vector2, Vector3, type BufferGeometry, type Intersection } from 'three';
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

/** Marge de sélection (pixels) autour d'un fil fin : un fil de Ø 1,2 mm fait moins d'un pixel à l'écran et ne se clique pas au rayon seul. */
const WIRE_PICK_PX = 6;
/** Un fil plus proche que la plaque touchée de moins de ça (mm) reste prioritaire (il est posé sur elle). */
const WIRE_DEPTH_SLACK = 3;
const centerlines = new WeakMap<BufferGeometry, Vector3[]>();
/** Points de la ligne centrale d'un fil (un sommet par anneau du tube), dans le repère de la mesh ; null si ce n'est pas un tube de fil. */
function wirePoints(geo: BufferGeometry): Vector3[] | null {
  if (!(geo instanceof TubeGeometry)) return null;
  let pts = centerlines.get(geo);
  if (!pts) {
    const ring = geo.parameters.radialSegments + 1, pos = geo.attributes.position;
    pts = [];
    for (let i = 0; i < pos.count; i += ring) pts.push(new Vector3().fromBufferAttribute(pos, i));
    centerlines.set(geo, pts);
  }
  return pts;
}

export function createPicker(v: View): Picker {
  const ray = new Raycaster();
  /** Fil visible le plus proche du rayon, avec une marge en pixels (et au moins son rayon) : { mesh, hit } ou null. */
  const nearestWire = (meshes: PlankMesh[]) => {
    const { origin, direction } = ray.ray;
    const pxWorld = (2 * Math.tan((v.camera.fov * Math.PI) / 360)) / v.renderer.domElement.clientHeight; // taille d'un pixel à 1 mm de la caméra
    let best: { mesh: PlankMesh; hit: Intersection; ratio: number } | null = null;
    const p = new Vector3();
    for (const mesh of meshes) {
      const pts = mesh.visible ? wirePoints(mesh.geometry) : null;
      if (!pts) continue;
      const radius = (mesh.geometry as TubeGeometry).parameters.radius;
      for (const q of pts) {
        p.copy(q).applyMatrix4(mesh.matrixWorld);
        const depth = p.clone().sub(origin).dot(direction);
        if (depth <= 0) continue;
        const allowed = Math.max(radius, WIRE_PICK_PX * pxWorld * depth), ratio = ray.ray.distanceToPoint(p) / allowed;
        if (ratio <= 1 && (!best || ratio < best.ratio)) best = { mesh, hit: { object: mesh, distance: depth, point: p.clone() }, ratio };
      }
    }
    return best;
  };
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
    const solid = hit && isPlankMesh(hit.object) ? { mesh: hit.object, hit } : null;
    const wire = nearestWire(meshes); // un fil fin se choisit à quelques pixels près, s'il n'est pas caché derrière une plaque
    return wire && (!solid || wire.hit.distance < solid.hit.distance + WIRE_DEPTH_SLACK) ? { mesh: wire.mesh, hit: wire.hit } : solid;
  };
  const firstHit = (objects: View['cutMark']['children']) => ray.intersectObjects(objects, false)[0];
  return { ray, rayAt, lineParam, firstPlank, firstHit };
}
