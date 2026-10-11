import { BufferGeometry, Color, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, Path, Shape, Vector2, type Object3D } from 'three';
import { holeOutline, outline, type Plank } from '../../model';
import { materials } from '../registry/materials';
import { PALETTE } from '../registry/palette';
import { piModel } from '../piModel';
import { partGeometry } from './part';
import { type PartGeometry } from './geometry';

/** Dessus (face +z de la plaque) clair, dessous un peu plus foncé, tranche (épaisseur) marron foncé : on voit tout de suite le sens et l'épaisseur. */
const TOP = new Color(PALETTE.plywoodTop), BOTTOM = new Color(PALETTE.plywoodBottom), SIDE = new Color(PALETTE.plywoodSide);
export function plankGeometry(p: Plank, t: number): PartGeometry {
  if (p.special && p.special !== 'alu') return partGeometry(p, t);
  const pts = outline(p);
  const shape = new Shape(pts.map(([x, y]) => new Vector2(x, y)));
  for (const h of p.holes) shape.holes.push(new Path(holeOutline(h).map(([x, y]) => new Vector2(x, y))));
  const geo = new ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
  geo.translate(0, 0, -t / 2);
  // couleur par face d'après la normale : dessus, dessous, tranche
  const nrm = geo.attributes.normal, col = new Float32Array(nrm.count * 3);
  for (let i = 0; i < nrm.count; i++) {
    const z = nrm.getZ(i), c = z > 0.5 ? TOP : z < -0.5 ? BOTTOM : SIDE;
    col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b;
  }
  if (p.special === 'alu') { const c = new Color(p.color ?? PALETTE.aluminium); for (let i = 0; i < nrm.count; i++) { const k = nrm.getZ(i) < -0.5 ? 0.9 : Math.abs(nrm.getZ(i)) <= 0.5 ? 0.8 : 1; col[3 * i] = c.r * k; col[3 * i + 1] = c.g * k; col[3 * i + 2] = c.b * k; } } // aluminium : une seule teinte
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  const pos: number[] = [];
  for (const loop of [pts, ...p.holes.map(holeOutline)]) for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    pos.push(a[0], a[1], -t / 2, b[0], b[1], -t / 2, a[0], a[1], t / 2, b[0], b[1], t / 2);
    if (loop.length <= 12) pos.push(a[0], a[1], -t / 2, a[0], a[1], t / 2); // verticales aux angles (pas sur les cercles)
  }
  return { geo, edges: new BufferGeometry().setAttribute('position', new Float32BufferAttribute(pos, 3)) };
}

/**
 * Tout ce qui change la forme d'une plaque : dimensions, crans, trous, épaisseur, chemin, profondeur, et la présence du modèle 3D du Pi.
 * Clé de cache de la géométrie d'une `PlankMesh` — (volontairement) inchangée par rapport à l'ancien code : voir le bug « clé incomplète » du rapport.
 */
export const plankShapeKey = (p: Plank, t: number): string => JSON.stringify([p.w, p.h, p.notches, p.holes, t, p.path, p.depth, p.special === 'pi' && !!piModel]);

/** La mesh d'une plaque : sa surface, ses arêtes (matériau partagé du registre) et son identifiant, typés (plus de `userData`). */
export class PlankMesh extends Mesh<BufferGeometry, MeshStandardMaterial> {
  readonly plankId: string;
  /** Arêtes tracées sur la surface (enfant de la mesh). */
  readonly edges: LineSegments<BufferGeometry, LineBasicMaterial>;
  /** Clé de la forme actuellement construite (voir `plankShapeKey`). */
  shapeKey = '';

  constructor(plankId: string) {
    super(new BufferGeometry(), new MeshStandardMaterial({ color: PALETTE.white, vertexColors: true, roughness: 0.85, side: DoubleSide }));
    this.plankId = plankId;
    this.edges = new LineSegments(new BufferGeometry(), materials.edge());
    this.add(this.edges);
  }

  /** Refait la géométrie si la forme a changé (libère l'ancienne). */
  updateShape(p: Plank, t: number): void {
    const key = plankShapeKey(p, t);
    if (this.shapeKey === key) return;
    const { geo, edges } = plankGeometry(p, t);
    this.geometry.dispose();
    this.geometry = geo;
    this.edges.geometry.dispose();
    this.edges.geometry = edges;
    this.shapeKey = key;
  }
}

/** Une mesh prête à être ajoutée à la scène pour cette plaque. */
export function createPlankMesh(p: Plank, t: number): PlankMesh {
  const m = new PlankMesh(p.id);
  m.updateShape(p, t);
  return m;
}

export const isPlankMesh = (o: Object3D | null | undefined): o is PlankMesh => o instanceof PlankMesh;
