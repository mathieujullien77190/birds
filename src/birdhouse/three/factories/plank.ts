import { BufferGeometry, Color, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, Path, Shape, Vector2, type Object3D } from 'three';
import { holeOutline, outline, type Plank } from '../../model';
import { materials, textures } from '../registry/materials';
import { PALETTE } from '../registry/palette';
import { piModel } from '../piModel';
import { partGeometry } from './part';
import { type PartGeometry } from './geometry';

/** Dessus (face +z de la plaque) clair, dessous un peu plus foncé, tranche (épaisseur) marron foncé : on voit tout de suite le sens et l'épaisseur. */
const TOP = new Color(PALETTE.plywoodTop), BOTTOM = new Color(PALETTE.plywoodBottom), SIDE = new Color(PALETTE.plywoodSide);
const MDF_TOP = new Color(PALETTE.mdfTop), MDF_BOTTOM = new Color(PALETTE.mdfBottom), MDF_SIDE = new Color(PALETTE.mdfSide);
export function plankGeometry(p: Plank, t: number): PartGeometry {
  if (p.special) return partGeometry(p, t);
  const pts = outline(p);
  const shape = new Shape(pts.map(([x, y]) => new Vector2(x, y)));
  for (const h of p.holes) shape.holes.push(new Path(holeOutline(h).map(([x, y]) => new Vector2(x, y))));
  const geo = new ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
  geo.translate(0, 0, -t / 2);
  // couleur par face d'après la normale : dessus, dessous, tranche
  const nrm = geo.attributes.normal, col = new Float32Array(nrm.count * 3);
  for (let i = 0; i < nrm.count; i++) {
    const z = nrm.getZ(i), mdf = p.material === 'mdf', c = z > 0.5 ? (mdf ? MDF_TOP : TOP) : z < -0.5 ? (mdf ? MDF_BOTTOM : BOTTOM) : mdf ? MDF_SIDE : SIDE;
    col[3 * i] = c.r; col[3 * i + 1] = c.g; col[3 * i + 2] = c.b;
  }
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
 * Tout ce qui change la forme ou la couleur d'une plaque : dimensions, crans, trous, épaisseur, chemin, profondeur, couleur, contour libre, haut incliné, type spécial,
 * et la présence du modèle 3D du Pi. Clé de cache de la géométrie d'une `PlankMesh`.
 */
export const plankShapeKey = (p: Plank, t: number): string => JSON.stringify([p.w, p.h, p.notches, p.holes, t, p.path, p.depth, p.color, p.poly, p.top, p.special, p.special === 'pi' && !!piModel, p.material]);

const PLANK_ROUGHNESS = 0.85;

/** La mesh d'une plaque : sa surface, ses arêtes (matériau partagé du registre) et son identifiant, typés (plus de `userData`). */
export class PlankMesh extends Mesh<BufferGeometry, MeshStandardMaterial> {
  readonly plankId: string;
  /** Arêtes tracées sur la surface (enfant de la mesh). */
  readonly edges: LineSegments<BufferGeometry, LineBasicMaterial>;
  /** Partie tournante (rotor du ventilateur), enfant de la mesh : même matériau que la plaque, arêtes en enfant ; absente pour les autres pièces. */
  rotor: Mesh<BufferGeometry, MeshStandardMaterial> | null = null;
  /** Plaque de la cassette du ventilateur : devient translucide quand le ventilateur tourne (`three/ghost.ts`) ; posé par `useSceneSync` d'après le nom. */
  ghost = false;
  /** La plaque est demandée translucide par le modèle (`Plank.transparent`) : le fantôme ne la rend pas opaque. */
  baseTransparent = false;
  /** Clé de la forme actuellement construite (voir `plankShapeKey`). */
  shapeKey = '';

  constructor(plankId: string) {
    super(new BufferGeometry(), new MeshStandardMaterial({ color: PALETTE.white, vertexColors: true, roughness: PLANK_ROUGHNESS, side: DoubleSide }));
    this.plankId = plankId;
    this.edges = new LineSegments(new BufferGeometry(), materials.edge());
    this.add(this.edges);
  }

  /**
   * Texture de chêne (pan de toit en chêne) : posée si `on`, retirée sinon (une plaque renommée redevient du contreplaqué, couleurs par sommet).
   * Le chêne est une texture partagée du registre : elle n'est jamais libérée avec la plaque.
   */
  setOak(on: boolean): void {
    const mat = this.material;
    if (on) {
      if (mat.map) return;
      mat.map = textures.oak(); mat.vertexColors = false; mat.color.set(PALETTE.white); mat.roughness = 0.7; mat.needsUpdate = true;
    } else if (mat.map) {
      mat.map = null; mat.vertexColors = true; mat.color.set(PALETTE.white); mat.roughness = PLANK_ROUGHNESS; mat.needsUpdate = true;
    }
  }

  /** Installe, remplace ou retire le rotor (libère l'ancien). L'angle courant est gardé quand on remplace. */
  private setRotor(g: PartGeometry['rotor']): void {
    if (!g) {
      if (this.rotor) { this.remove(this.rotor); this.rotor.geometry.dispose(); this.rotor.children.forEach((c) => { if (c instanceof LineSegments) c.geometry.dispose(); }); this.rotor = null; }
      return;
    }
    if (!this.rotor) {
      this.rotor = new Mesh(g.geo, this.material);
      this.rotor.add(new LineSegments(g.edges, materials.edge()));
      this.add(this.rotor);
      return;
    }
    this.rotor.geometry.dispose(); this.rotor.geometry = g.geo;
    for (const c of this.rotor.children) if (c instanceof LineSegments) { c.geometry.dispose(); c.geometry = g.edges; }
  }

  /** Refait la géométrie si la forme a changé (libère l'ancienne). */
  updateShape(p: Plank, t: number): void {
    const key = plankShapeKey(p, t);
    if (this.shapeKey === key) return;
    const { geo, edges, rotor } = plankGeometry(p, t);
    this.geometry.dispose();
    this.geometry = geo;
    this.edges.geometry.dispose();
    this.edges.geometry = edges;
    this.setRotor(rotor);
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
