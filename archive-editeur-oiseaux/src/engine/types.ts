// Modèle de données d'un oiseau : une liste de pièces sérialisables.
// Compatible dans l'esprit avec l'ancien atelier (pos / rot en degrés / scl / color / detail / smooth / mirror).

export type Vec3 = [number, number, number];

/** Formes disponibles. Repère de l'app : X = droite, Y = avant de l'oiseau, Z = haut. */
export type ShapeKind = 'body' | 'ball' | 'flatTopBall' | 'pyramid' | 'cone' | 'cylinder' | 'cylinderX' | 'head' | 'bill' | 'eye' | 'wing' | 'tail' | 'mesh';

export interface Part {
  id: string;
  shape: ShapeKind;
  /** Nom affiché dans la liste des pièces. */
  name: string;
  pos: Vec3;
  /** Rotation en degrés (ordre XYZ). */
  rot: Vec3;
  /** Étirement par axe (symétrique : les deux côtés). */
  scl: Vec3;
  /** Étirement d'un seul côté le long de Y : [avant (+Y), arrière (−Y)]. 1 = inchangé. L'autre côté ne bouge pas. */
  yStretch: [number, number];
  /** Couleur de base, hex `#rrggbb` (sera adoucie « style Alba » au rendu). */
  color: string;
  /** Finesse du maillage, 1 à 5. */
  detail: number;
  /** Normales lissées (true) ou facettes franches (false). */
  smooth: boolean;
  /** Copie symétrique de l'autre côté (plan X = 0) : yeux, ailes, pattes. */
  mirror: boolean;
  /** Rendu semi-transparent (pour voir les axes et les pièces à l'intérieur). */
  transparent: boolean;
  /** Dessine les axes locaux de la pièce (X rouge, Y vert, Z bleu) à son centre. */
  showAxes: boolean;
  /** Coins libres (pyramide) : positions locales des points de contrôle, tirables à la souris. */
  points?: Vec3[];
  /** Maillage importé (.stl), forme 'mesh' : sommets locaux (centrés sur la pièce) et indices des triangles. */
  mesh?: MeshData;
}

export interface MeshData {
  pos: number[];
  idx: number[];
}

export type Axis = 'X' | 'Y' | 'Z';
/**
 * Axes de rotation autorisés par forme. Le corps ne bascule qu'autour de X (axe horizontal gauche-droite, rouge) :
 * il se penche vers l'avant / l'arrière dans le plan vertical Y-Z, comme un canard qui baisse la poitrine.
 */
export const ROTATION_AXES: Record<ShapeKind, Axis[]> = {
  body: ['X'],
  ball: ['X', 'Y', 'Z'],
  flatTopBall: ['X', 'Y', 'Z'],
  pyramid: ['X', 'Y', 'Z'],
  cone: ['X', 'Y', 'Z'],
  cylinder: ['X', 'Y', 'Z'],
  cylinderX: ['X', 'Y', 'Z'],
  head: ['X', 'Y', 'Z'],
  bill: ['X', 'Y', 'Z'],
  eye: ['X', 'Y', 'Z'],
  wing: ['X', 'Y', 'Z'],
  tail: ['X', 'Y', 'Z'],
  mesh: ['X', 'Y', 'Z'],
};
/** Remet à 0 les rotations interdites pour la forme. */
export const lockRotation = (shape: ShapeKind, rot: Vec3): Vec3 =>
  rot.map((v, i) => (ROTATION_AXES[shape].includes((['X', 'Y', 'Z'] as Axis[])[i]) ? v : 0)) as Vec3;

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  body: 'Corps (œuf couché)',
  ball: 'Boule',
  flatTopBall: 'Boule aplatie dessus',
  pyramid: 'Pyramide (coins étirables)',
  cone: 'Cône',
  cylinder: 'Cylindre',
  cylinderX: 'Cylindre couché (axe X)',
  head: 'Tête',
  bill: 'Bec de canard',
  eye: 'Œil',
  wing: 'Aile repliée',
  tail: 'Queue',
  mesh: 'Maillage importé (.stl)',
};

export const SHAPE_ORDER: ShapeKind[] = ['body', 'ball', 'flatTopBall', 'pyramid', 'cone', 'cylinder', 'cylinderX', 'head', 'bill', 'eye', 'wing', 'tail']; // 'mesh' n'est pas ajoutable à la main : il vient d'un import .stl
