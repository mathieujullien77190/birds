import { Vector3 } from 'three';
import type { CameraShooter } from './cameraShooter';
import type { PlankMesh } from './factories/plank';
import type { AmbientLight, DirectionalLight, Group, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface View { ambient: AmbientLight; sun: DirectionalLight; scene: Scene; camera: PerspectiveCamera; renderer: WebGLRenderer; orbit: OrbitControls; meshes: Map<string, PlankMesh>; labels: Group; holeMark: Group; pullMark: Group; cutMark: Group; /** Prises de vue des caméras du Pi (libérées avec la vue). */ shooter: CameraShooter; dragging: boolean }

/** Plan de coupe : l'espace est coupé en deux, on voit un côté, l'autre est invisible. */
export interface Cut { on: boolean; axis: 'x' | 'y' | 'z'; pos: number; flip: boolean }
export const AXIS_N: Record<Cut['axis'], Vector3> = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) };
export const AXIS_I = { x: 0, y: 1, z: 2 } as const;
