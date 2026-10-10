import { DoubleSide, LineDashedMaterial, MeshBasicMaterial, Vector3 } from 'three';
import type { Group, Mesh, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface View { scene: Scene; camera: PerspectiveCamera; renderer: WebGLRenderer; orbit: OrbitControls; meshes: Map<string, Mesh>; labels: Group; handles: Group; targets: Group; holeMark: Group; pullMark: Group; cutMark: Group; dragging: boolean }

/** Plan de coupe : l'espace est coupé en deux, on voit un côté, l'autre est invisible. */
export interface Cut { on: boolean; axis: 'x' | 'y' | 'z'; pos: number; flip: boolean }
export const AXIS_N: Record<Cut['axis'], Vector3> = { x: new Vector3(1, 0, 0), y: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1) };
export const AXIS_I = { x: 0, y: 1, z: 2 } as const;
export const CUT_MAT = new MeshBasicMaterial({ color: '#2563eb', transparent: true, opacity: 0.18, side: DoubleSide, depthWrite: false });

export const PULL_MARK = new LineDashedMaterial({ color: '#0284c7', dashSize: 3, gapSize: 2, depthTest: false });


export const HOLE_MARK = new LineDashedMaterial({ color: '#d97706', dashSize: 2.5, gapSize: 1.5, depthTest: false });

/** Ronds de coin : vert clair sur la face avant (+z de la plaque, ou z max d'une boîte), vert foncé sur la face arrière — sur une plaque fine les deux se chevauchent, on les distingue à la couleur. */
export const SNAP = 16; // pixels à l'écran : un coin tiré qui passe devant ou derrière un coin d'une autre pièce s'y aimante, quelle que soit la profondeur
