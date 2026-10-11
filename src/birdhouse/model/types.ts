export type Vec3 = [number, number, number];

export type Pt = [number, number];

export type Edge = 'bottom' | 'right' | 'top' | 'left';

/** Un cran : sur un bord, centré à `pos` (depuis la gauche pour haut / bas, depuis le bas pour gauche / droite), `width` de large, `depth` de profond. */
export interface Notch { id: string; edge: Edge; pos: number; width: number; depth: number }

/** Un trou dans la plaque : rond (diamètre `size`) ou rectangulaire (`size` de long sur `sh` de large, coins arrondis de rayon `r`), centré en (x, y) depuis le centre de la plaque. */
export interface Hole { id: string; shape: 'round' | 'square'; x: number; y: number; size: number; sh?: number; r?: number }

export interface Plank {
  id: string;
  /** Élément spécial (pas du bois) : dessiné par son propre modèle 3D, exclu de la découpe laser. « camera » (carte caméra) ou « ir » (carte de LED infrarouges). */
  /** Contour libre (repère de la plaque, sens trigonométrique) : remplace le rectangle (crans et trous restent possibles). */
  poly?: [number, number][];
  /** Pavé à contour en plan : le haut est un plan incliné z = z0 + bx · x + by · y (repère de la plaque, z relatif au centre). */
  top?: { z0: number; bx: number; by: number };
  special?: 'camera' | 'ir' | 'bar' | 'pi' | 'cable' | 'wire' | 'case' | 'block' | 'heatsink' | 'sensor' | 'fan' | 'peltier' | 'driver' | 'alu' | 'solar' | 'doc' | 'conduit';
  /** « block » (pavé) : épaisseur réelle du pavé selon z, au lieu de l'épaisseur du bois. */
  depth?: number;
  /** « wire » : couleur du fil (CSS). */
  color?: string;
  /** « cable » : chemin de la nappe (points, dans le repère local de la plaque, posée en pos = 0) ; w = largeur de la nappe. */
  path?: Vec3[];
  name: string;
  w: number;
  h: number;
  /** Position du centre et rotation (degrés, ordre XYZ). */
  pos: Vec3;
  rot: Vec3;
  notches: Notch[];
  holes: Hole[];
  /** Crénelages d'emboîtement actifs, par bord (les crans correspondants sont dans `notches`). */
  cast?: Partial<Record<Edge, { n: number; phase: 0 | 1 }>>;
  /** Affichée en transparence (pour voir dedans). */
  transparent?: boolean;
  /** Plaques liées : même identifiant de groupe → elles se déplacent et tournent ensemble. */
  group?: string;
  /** Lien vers la fiche du composant (site de référence ou revendeur) : affiché dans « Pièces ». */
  url?: string;
}

export interface PlankScene { t: number; fit: number; planks: Plank[]; /** Nom des groupes (boîtes…) par identifiant. */ groupNames?: Record<string, string>; /** 'z2' : scène en Z = hauteur. (Vide : ancienne scène Y = hauteur ; 'z' / 'z1' : converties par des versions intermédiaires fautives ; toutes réparées au chargement.) */ up?: 'z' | 'z1' | 'z2' }

/** Historique de « Retour », gardé aussi au rechargement, sans limite (si le navigateur refuse par manque de place, on lâche la moitié la plus ancienne et on réessaie). */
export interface HistoryEntry { label: string; scene: PlankScene; at: number }

export interface Placed { plank: Plank; poly: Pt[]; x: number; y: number }

export interface NestItem { plank: Plank; poly: Pt[]; holes: Pt[][]; w: number; h: number; x: number; y: number; rotated: boolean }
export interface NestSheet { items: NestItem[]; used: number }

export type FaceAxis = 'x' | 'y' | 'z';

/** Réglages d'un nichoir à double paroi (mm) : intérieur utile l × L, hauteur du sol au bas du trou, trou, hauteur au-dessus du trou, épaisseur d'isolant. */
export interface NestParams { l: number; L: number; floorToHole: number; hole: number; above: number; ins: number; /** côté intérieur du compartiment caméra dans l'isolant du toit (0 = aucun) */ cam: number; /** deuxième caméra dans une mini boîte en contreplaqué, sous le toit à gauche, tournée vers le trou d'entrée ; longue nappe jusqu'au 2ᵉ port caméra du Pi */ cam2: boolean; /** système solaire : panneau de 100 W sur poteaux, déporté ; batterie, régulateur et pont en H dans le toit */ solar: boolean; /** lambris : une couche de lames verticales sur les quatre côtés du corps */ chene: boolean; /** planche de chêne de 18 mm posée sur le toit, qui déborde de 15 mm */ lambris: boolean; /** toit en pente (deux pans en diagonale sur les côtés, au-dessus du toit plat) */ pente: boolean; /** module Peltier + radiateur alu sur la moitié haute du mur arrière + capteur de température / humidité */ clim: boolean }
