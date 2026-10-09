import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { Part, ShapeKind } from '../types';
import { eggBodyGeometry } from './eggBody';
import { headGeometry } from './head';
import { billGeometry } from './bill';
import { eyeGeometry } from './eye';
import { wingGeometry } from './wing';
import { tailGeometry } from './tail';
import { ballGeometry } from './ball';
import { flatTopBallGeometry } from './flatTopBall';
import { pyramidGeometry } from './pyramid';
import type { Vec3 } from '../types';
import { coneGeometry } from './cone';
import { cylinderGeometry } from './cylinder';
import { cylinderXGeometry } from './cylinderX';

/**
 * Finesse maximale par forme (niveau de subdivision L). Par défaut une pièce est créée au maximum.
 * Icosaèdre : 20·(L+1)² triangles (L = 12 → 3 380). Formes extrudées : quelques centaines.
 */
export const DETAIL_MAX: Record<ShapeKind, number> = {
  body: 12,
  ball: 12,
  flatTopBall: 12,
  pyramid: 1,
  cone: 12,
  cylinder: 12,
  cylinderX: 12,
  head: 12,
  bill: 8,
  eye: 4,
  wing: 10,
  tail: 8,
  mesh: 1,
};

export const clampDetail = (shape: ShapeKind, detail: number): number =>
  Math.min(DETAIL_MAX[shape], Math.max(1, Math.round(detail)));

/** Les formes sont dessinées avec l'avant en +Z et le haut en +Y (repère three.js) : on les passe dans le repère de l'app (avant +Y, haut +Z). */
function toAppFrame(g: BufferGeometry): BufferGeometry {
  g.rotateX(Math.PI / 2); // +Y → +Z (haut), +Z → −Y
  g.rotateZ(Math.PI); // −Y → +Y (avant) ; X est retourné, sans effet : les formes sont symétriques en X
  g.computeVertexNormals();
  return g;
}

/** Géométrie de départ d'une forme (sans couleur). Avant = +Y, haut = +Z. */
export function shapeGeometry(shape: ShapeKind, detail: number, points?: Vec3[]): BufferGeometry {
  const L = clampDetail(shape, detail);
  switch (shape) {
    case 'pyramid':
      return pyramidGeometry(points); // déjà dans le repère de l'app
    case 'body':
      return toAppFrame(eggBodyGeometry(L));
    case 'ball':
      return toAppFrame(ballGeometry(L));
    case 'flatTopBall':
      return toAppFrame(flatTopBallGeometry(L));
    case 'cone':
      return toAppFrame(coneGeometry(L));
    case 'cylinder':
      return toAppFrame(cylinderGeometry(L));
    case 'cylinderX':
      return toAppFrame(cylinderXGeometry(L));
    case 'head':
      return toAppFrame(headGeometry(L));
    case 'bill':
      return toAppFrame(billGeometry(L));
    case 'eye':
      return toAppFrame(eyeGeometry(L));
    case 'wing':
      return toAppFrame(wingGeometry(L));
    case 'tail':
      return toAppFrame(tailGeometry(L));
    case 'mesh':
      return new BufferGeometry(); // la géométrie d'un maillage importé vient de part.mesh : voir partGeometry()
  }
}

/** Étire un seul côté le long de Y (avant / arrière) : les sommets à y > 0 par `front`, ceux à y < 0 par `back`. Continu en y = 0. */
export function stretchY(geo: BufferGeometry, front: number, back: number): BufferGeometry {
  if (front === 1 && back === 1) return geo;
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setY(i, y > 0 ? y * front : y * back);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

const triCache = new Map<string, number>();
/** Nombre de triangles d'une forme à une finesse donnée (calculé une fois, puis mis en cache). */
export function triangleCount(shape: ShapeKind, detail: number): number {
  const key = `${shape}|${clampDetail(shape, detail)}`;
  let n = triCache.get(key);
  if (n === undefined) {
    const g = shapeGeometry(shape, detail);
    n = (g.index ? g.index.count : g.attributes.position.count) / 3;
    g.dispose();
    triCache.set(key, n);
  }
  return n;
}

/** Géométrie de départ d'une pièce (sans couleur) : forme paramétrique, ou maillage importé. */
export function partGeometry(part: Part): BufferGeometry {
  if (part.shape === 'mesh' && part.mesh) {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(part.mesh.pos, 3));
    g.setIndex(part.mesh.idx);
    return g;
  }
  return shapeGeometry(part.shape, part.detail, part.points);
}

/** Nombre de triangles d'une pièce (sans la copie miroir). */
export const partTriangles = (part: Part): number =>
  part.mesh ? part.mesh.idx.length / 3 : triangleCount(part.shape, part.detail);
