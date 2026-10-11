import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BufferGeometry, EdgesGeometry, Float32BufferAttribute, type Color } from 'three';
import { PART } from '../constants';

/** Ce que fabrique une fabrique de pièce : la surface (couleurs par sommet) et ses arêtes (vides pour les fils, nappes, panneaux). */
export interface PartGeometry { geo: BufferGeometry; edges: BufferGeometry; /** Partie tournante (rotor d'un ventilateur) : maillage à part, enfant de la mesh, qui tourne autour de l'axe z local. */ rotor?: { geo: BufferGeometry; edges: BufferGeometry } }

/** Un morceau d'une pièce : sa géométrie et sa couleur. */
export interface Part { g: BufferGeometry; c: Color }

/** Peint toute la géométrie d'une seule couleur (attribut `color`). */
export function paintUniform(g: BufferGeometry, c: Color): void {
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b; }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
}

/** Fusionne des morceaux colorés : chacun passe en non indexé, sans UV, peint de sa couleur, puis tout est regroupé en une seule géométrie. */
export function mergeColored(parts: Part[]): BufferGeometry {
  const geos = parts.map(({ g, c }) => {
    const ni = g.toNonIndexed();
    ni.deleteAttribute('uv');
    paintUniform(ni, c);
    return ni;
  });
  const merged = mergeGeometries(geos);
  if (!merged) throw new Error('mergeColored : fusion impossible (attributs incompatibles)');
  return merged;
}

/** Géométrie d'arêtes vide (rien à tracer). */
export const emptyEdges = (): BufferGeometry => new BufferGeometry().setAttribute('position', new Float32BufferAttribute([], 3));

/** Arêtes vives d'une surface (angle `PART.edgeAngle`). */
export const edgesOf = (geo: BufferGeometry): BufferGeometry => new EdgesGeometry(geo, PART.edgeAngle);

/** Surface fusionnée + ses arêtes : le cas le plus courant. */
export function coloredPart(parts: Part[]): PartGeometry {
  const geo = mergeColored(parts);
  return { geo, edges: edgesOf(geo) };
}
