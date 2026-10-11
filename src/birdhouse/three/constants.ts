/** Constantes de la vue 3D : un seul endroit pour les nombres qui réglaient jusqu'ici la scène « en dur ». */
import { CASE_H, CASE_WALL } from '../model';

/** Caméra de la vue principale. */
export const VIEW = {
  fov: 40,
  near: 1,
  far: 6000,
  /** Vue de départ en 3/4 tournée de 180° (réglée par l'utilisateur), assez loin pour voir le nichoir ET le panneau solaire. */
  position: [-945, -1676, 1548] as const,
  target: [330, 0, 100] as const,
  maxPixelRatio: 2,
} as const;

/** Ambiances de la scène : le jour (ciel clair, soleil) et la nuit (fond sombre, faible lumière bleutée de lune). Source unique : scène initiale ET bascule jour / nuit. */
export const AMBIENCE = {
  day: { background: '#eef2f1', ambient: '#ffffff', ambientI: 1.1, sun: '#ffffff', sunI: 1.8 },
  night: { background: '#070b14', ambient: '#8aa4ff', ambientI: 0.16, sun: '#9db4ff', sunI: 0.35 },
} as const;
export const SUN_POSITION = [300, -400, 500] as const;

/** Repères de la scène : ordre de dessin et décalages par rapport à la plaque. */
export const MARK = {
  cutRenderOrder: 5,
  dimensionRenderOrder: 20,
  holeRenderOrder: 25,
  pullRenderOrder: 26,
  /** Les contours de trou sont dessinés 0,3 mm au-dessus des deux faces (z = ± t/2 ± 0,3). */
  holeOffset: 0.3,
  /** Les cotes du trou sont dans le plan de la face avant, 0,6 mm au-dessus. */
  holeDimensionOffset: 0.6,
  /** Le contour de la face tirée dépasse la plaque de 0,3 mm. */
  pullOffset: 0.3,
  /** Plan de coupe : le carré dépasse l'encombrement de 40 %, 50 mm au minimum. */
  cutScale: 1.4,
  cutMinSize: 50,
  /** Écart entre l'habillage et ses cotes. */
  dimensionGap: 14,
} as const;

/** Couleurs d'émission de la sélection (surbrillance). */
export const EMISSIVE = {
  hover: '#d97706',
  chosen: '#3d6f5a',
  extra: '#2f5f8a',
  none: '#000000',
  hoverIntensity: 0.5,
  baseIntensity: 0.35,
} as const;

/** Prise de vue d'une carte caméra (flux vidéo du simulateur du Pi). */
export const CAMERA_SHOT = {
  /** Le bout de l'objectif est à 9,8 mm sous le plan de la carte. */
  lensTip: 9.8,
  defaultFov: 70,
  near: 1,
  far: 5000,
  width: 320,
  height: 240,
  jpegQuality: 0.75,
  /** Lampe ponctuelle des LED infrarouges, le temps de la prise de vue. */
  lamp: { color: '#ffffff', intensity: 2.6, distance: 900, decay: 0 },
  /** Amplitude du grain du capteur la nuit : avec les LED infrarouges / sans. */
  grainIr: 26,
  grain: 14,
} as const;

/** Géométrie des pièces : les nombres partagés avec le modèle viennent du modèle. */
export const PART = {
  caseHeight: CASE_H,
  caseWall: CASE_WALL,
  /** Angle (degrés) au-delà duquel `EdgesGeometry` trace une arête. */
  edgeAngle: 30,
} as const;
