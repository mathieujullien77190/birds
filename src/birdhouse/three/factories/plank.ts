import { BufferGeometry, Color, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, Path, Shape, Vector2, type Object3D } from 'three';
import { codeSpot, holeOutline, outline, type Plank } from '../../model';
import { createCodeLabel, type CodeLabel } from './codeLabel';
import { materials } from '../registry/materials';
import { PALETTE } from '../registry/palette';
import { piModel } from '../piModel';
import { partGeometry } from './part';
import { type PartGeometry } from './geometry';

/** Dessus (face +z de la plaque) clair, dessous un peu plus foncé, tranche (épaisseur) marron foncé : on voit tout de suite le sens et l'épaisseur. */
const TOP = new Color(PALETTE.plywoodTop), BOTTOM = new Color(PALETTE.plywoodBottom), SIDE = new Color(PALETTE.plywoodSide);

/** Contreplaqué huilé (tout sauf le nid) : plus chaud, pastel. */
const OIL_TOP = new Color(PALETTE.oiledTop), OIL_BOTTOM = new Color(PALETTE.oiledBottom), OIL_SIDE = new Color(PALETTE.oiledSide);

/** Bois BRUT (non huilé) : l'intérieur du nid (parois intérieures, plancher intérieur, bloc d'entrée). Tout le reste du contreplaqué est huilé. */
export const isRawWood = (p: Plank): boolean => !p.special && /^((Face avant|Face arrière|Côté droit|Côté gauche) int|Plancher int|Entrée \d+)$/.test(p.name);

const MDF_TOP = new Color(PALETTE.mdfTop), MDF_BOTTOM = new Color(PALETTE.mdfBottom), MDF_SIDE = new Color(PALETTE.mdfSide);
export function plankGeometry(p: Plank, scene_t: number): PartGeometry {
  if (p.special) return partGeometry(p, scene_t);
  const t = p.material === 'okoume' ? (p.depth ?? scene_t) : scene_t; // l'okoumé de l'habillage a sa propre épaisseur (5 mm)
  const pts = outline(p);
  const shape = new Shape(pts.map(([x, y]) => new Vector2(x, y)));
  for (const h of p.holes) shape.holes.push(new Path(holeOutline(h).map(([x, y]) => new Vector2(x, y))));
  const geo = new ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
  geo.translate(0, 0, -t / 2);
  // couleur par face d'après la normale : dessus, dessous, tranche
  const raw = isRawWood(p), paint = new Color(p.color ?? PALETTE.white), nrm = geo.attributes.normal, col = new Float32Array(nrm.count * 3);
  for (let i = 0; i < nrm.count; i++) {
    const z = nrm.getZ(i), mdf = p.material === 'mdf', c = p.material === 'okoume' ? paint : z > 0.5 ? (mdf ? MDF_TOP : raw ? TOP : OIL_TOP) : z < -0.5 ? (mdf ? MDF_BOTTOM : raw ? BOTTOM : OIL_BOTTOM) : mdf ? MDF_SIDE : raw ? SIDE : OIL_SIDE;
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
export const plankShapeKey = (p: Plank, t: number): string => JSON.stringify([p.w, p.h, p.notches, p.holes, t, p.path, p.depth, p.wood, p.color, p.poly, p.special, isRawWood(p), p.special === 'pi' && !!piModel, p.material]);

const PLANK_ROUGHNESS = 0.85; // pièces spéciales (composants)
const RAW_ROUGHNESS = 0.62, OILED_ROUGHNESS = 0.42; // plaques : brut légèrement brillant, huilé plus brillant

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
  /** Étiquette du code de la plaque (enfant de la mesh, ressources partagées du registre) ; absente si les codes sont cachés ou si la plaque n'en a pas. */
  label: CodeLabel | null = null;
  private labelKey = '';

  constructor(plankId: string) {
    super(new BufferGeometry(), new MeshStandardMaterial({ color: PALETTE.white, vertexColors: true, roughness: PLANK_ROUGHNESS, side: DoubleSide }));
    this.plankId = plankId;
    this.edges = new LineSegments(new BufferGeometry(), materials.edge());
    this.add(this.edges);
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

  /**
   * Pose, remplace ou retire l'étiquette du code (`null` : plus d'étiquette). Elle se place à l'emplacement gravé (`codeSpot`) ; rien n'est refait si ni le code ni la forme n'ont changé.
   * Géométrie et matériau de l'étiquette viennent du registre : jamais libérés avec la plaque.
   */
  setCode(code: string | null, p: Plank, t: number): void {
    const spot = code ? codeSpot(p, code.length) : null;
    const th = p.material === 'okoume' ? (p.depth ?? t) : t; // même épaisseur que la géométrie
    const key = code && spot ? `${code}|${this.shapeKey}|${th}` : '';
    if (key === this.labelKey) return;
    if (this.label) { this.remove(this.label); this.label = null; } // ressources partagées : rien à libérer
    this.labelKey = key;
    if (code && spot) { this.label = createCodeLabel(code, spot, th); this.add(this.label); }
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
    this.material.roughness = p.special ? PLANK_ROUGHNESS : isRawWood(p) ? RAW_ROUGHNESS : OILED_ROUGHNESS;
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
