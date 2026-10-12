import { BufferGeometry, Float32BufferAttribute, LineLoop, Mesh, PlaneGeometry, Vector3, type Object3D } from 'three';
import { bounds, extents, outline, type FaceAxis, type Plank, type PlankScene } from '../../model';
import { MARK } from '../constants';
import { materials } from '../registry/materials';
import { AXIS_I, AXIS_N, type Cut } from '../types';
import { dimension } from './dimension';

/** Une face de plaque à tirer : l'axe de sa normale (repère de la plaque) et son sens. */
export interface PullTarget { plankId: string; axis: FaceAxis; sign: 1 | -1 }

/** Repère de la face à tirer : son contour en pointillés bleus (repère de la plaque). */
export function pullMarkObject(p: Plank, pull: PullTarget, t: number): LineLoop {
  const t2 = t / 2 + MARK.pullOffset, w2 = p.w / 2 + MARK.pullOffset, h2 = p.h / 2 + MARK.pullOffset;
  let loop: number[];
  if (pull.axis === 'z') { const z = pull.sign * t2; loop = outline(p).flatMap(([x, y]) => [x, y, z]); }
  else if (pull.axis === 'x') { const x = pull.sign * w2; loop = [x, -h2, -t2, x, h2, -t2, x, h2, t2, x, -h2, t2]; }
  else { const y = pull.sign * h2; loop = [-w2, y, -t2, w2, y, -t2, w2, y, t2, -w2, y, t2]; }
  const line = new LineLoop(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(loop, 3)), materials.pullMark());
  line.computeLineDistances();
  line.renderOrder = MARK.pullRenderOrder;
  return line;
}

/** Plan de coupe : un grand carré bleu transparent, à la position réglée (null s'il n'y a rien à couper). */
export function cutMarkObject(planks: Plank[], t: number, cut: Cut): Mesh | null {
  if (!cut.on || !planks.length) return null;
  const { min, max } = bounds(planks, t);
  const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], MARK.cutMinSize) * MARK.cutScale;
  const quad = new Mesh(new PlaneGeometry(size, size), materials.cut());
  const n = AXIS_N[cut.axis];
  quad.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), n);
  quad.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  quad.position.setComponent(AXIS_I[cut.axis], cut.pos);
  quad.renderOrder = MARK.cutRenderOrder;
  return quad;
}

/**
 * Cotes de l'HABILLAGE seulement (demande de l'utilisateur : plus de cotes sur les autres pièces) : l × L × H de l'encombrement de ses plaques visibles,
 * posées en coordonnées du monde (largeur devant au sol, profondeur à droite au sol, hauteur sur l'arête ARRIÈRE droite, derrière le nichoir : demande de l'utilisateur).
 */
export function habillageDimensions(sc: PlankScene, hidden: ReadonlySet<string>): Object3D[] {
  const out: Object3D[] = [];
  const O = MARK.dimensionGap; // écart entre l'objet et la cote
  const done = new Set<string>();
  for (const p of sc.planks) {
    if (!p.group || !(sc.groupNames?.[p.group] ?? '').startsWith('Habillage')) continue;
    if (done.has(p.group)) continue;
    done.add(p.group);
    const members = sc.planks.filter((x) => x.group === p.group && !hidden.has(x.id));
    if (!members.length) continue;
    const { min, max } = bounds(members, sc.t);
    const [l, L, H] = extents(members, sc.t);
    const X = new Vector3(1, 0, 0), Yn = new Vector3(0, -1, 0);
    out.push(
      dimension(new Vector3(min[0], min[1] - O, min[2]), new Vector3(max[0], min[1] - O, min[2]), Yn, Yn.clone().multiplyScalar(O), `${l}`),
      dimension(new Vector3(max[0] + O, min[1], min[2]), new Vector3(max[0] + O, max[1], min[2]), X, X.clone().multiplyScalar(O), `${L}`),
      dimension(new Vector3(max[0] + O, max[1] + O, min[2]), new Vector3(max[0] + O, max[1] + O, max[2]), X, new Vector3(O, O, 0), `${H}`),
    );
  }
  return out;
}
