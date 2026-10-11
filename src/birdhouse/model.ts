/**
 * Plaques de bois : des rectangles d'une épaisseur commune, posés librement dans l'espace, avec des crans (encoches
 * rectangulaires) sur leurs bords pour s'emboîter. Tout en millimètres. Repère d'une plaque : x = largeur, y = hauteur,
 * centrée sur son milieu ; l'épaisseur est le long de z, centrée aussi.
 * **Monde : Z = hauteur** (X = largeur, Y = profondeur, +y = arrière, sol = plan XY), comme la visionneuse STL.
 */

/**
 * Façade du modèle : réexporte tout (mêmes noms qu'avant la découpe en modules de `model/`).
 * Règle : `model/` est PUR — aucun import de three.js ; les rotations passent par `model/math/rotation`.
 */
export * from './model/types';
export * from './model/util';
export * from './model/constants';
export * from './model/geometry';
export * from './model/persistence';
export * from './model/sheets';
export * from './model/nest';
export * from './model/wires';
export type { Rotation, V3 } from './model/math/rotation';
export { fromAxisAngle, fromEulerDeg } from './model/math/rotation';
