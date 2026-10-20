export type Vec3 = [number, number, number];

export type Pt = [number, number];

export type Edge = 'bottom' | 'right' | 'top' | 'left';

/** Un cran : sur un bord, centré à `pos` (depuis la gauche pour haut / bas, depuis le bas pour gauche / droite), `width` de large, `depth` de profond. */
export interface Notch { id: string; edge: Edge; pos: number; width: number; depth: number }

/** Un trou dans la plaque : rond (diamètre `size`) ou rectangulaire (`size` de long sur `sh` de large, coins arrondis de rayon `r`), centré en (x, y) depuis le centre de la plaque. */
export interface Hole { id: string; shape: 'round' | 'square'; x: number; y: number; size: number; sh?: number; r?: number; /** Contour libre (repère de la plaque, sens trigonométrique) : remplace la forme (un trou en peigne : ouverture + fentes des dents d'une boîte qui la traverse). */ poly?: [number, number][] }

export interface Plank {
  id: string;
  /** Matériau de la plaque découpée : absent = contreplaqué ; 'mdf' = MDF, 'okoume' = contreplaqué okoumé extérieur (habillage peint en blanc, toit non peint ; épaisseur `depth`) : chacun est découpé sur ses propres planches. */
  material?: 'mdf' | 'okoume';
  /** Élément spécial (pas du bois) : dessiné par son propre modèle 3D, exclu de la découpe laser. « camera » (carte caméra) ou « ir » (carte de LED infrarouges). */
  /** Contour libre (repère de la plaque, sens trigonométrique) : remplace le rectangle (crans et trous restent possibles). */
  poly?: [number, number][];
  special?: 'camera' | 'ir' | 'bar' | 'pi' | 'cable' | 'wire' | 'case' | 'block' | 'sensor' | 'fan' | 'driver' | 'relay' | 'doc' | 'conduit' | 'guard' | 'pin';
  /** « block » (pavé) ou plaque d'un autre matériau (`material`) : épaisseur réelle selon z, au lieu de l'épaisseur du bois. */
  depth?: number;
  /** Caméra, LED infrarouges, capteur : épaisseur de bois que traverse leur corps (lentille, LED, puce). La carte s'appuie sur une face du bois, le bout du corps affleure l'autre face. */
  wood?: number;
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
  /** Pièce fine de rechange : identifiant de la plaque dont elle est un exemplaire identique ; elle porte le même code de numérotation que son original. */
  spareOf?: string;
}

export interface PlankScene { t: number; fit: number; planks: Plank[]; /** Nom des groupes (boîtes…) par identifiant. */ groupNames?: Record<string, string>; /** 'z2' : scène en Z = hauteur. (Vide : ancienne scène Y = hauteur ; 'z' / 'z1' : converties par des versions intermédiaires fautives ; toutes réparées au chargement.) */ up?: 'z' | 'z1' | 'z2' }

/** Une étape de « Retour » (en mémoire seulement, plus enregistrée au rechargement). */
export interface HistoryEntry { label: string; scene: PlankScene; at: number }

export interface Placed { plank: Plank; poly: Pt[]; x: number; y: number }

export interface NestItem { plank: Plank; poly: Pt[]; holes: Pt[][]; w: number; h: number; x: number; y: number; rotated: boolean; /** Quarts de tour appliqués à la pièce (0 à 3). */ turns: 0 | 1 | 2 | 3; /** Code de la plaque (« T01 »). */ code?: string; /** Contours fermés du code à graver (bleu), dans le même repère que `poly` ; absent si la plaque est trop petite. */ engrave?: Pt[][] }
export interface NestSheet { items: NestItem[]; used: number; /** 'mdf' : feuille de MDF, 'okoume' : feuille d'okoumé extérieur 5 mm (matériaux distincts du contreplaqué) ; absent : contreplaqué. */ material?: 'mdf' | 'okoume' }

export type FaceAxis = 'x' | 'y' | 'z';

/** Réglages d'un nichoir à double paroi (mm) : intérieur utile l × L, hauteur du sol au bas du trou, trou, hauteur au-dessus du trou, épaisseur d'isolant. */
export interface NestParams { l: number; L: number; floorToHole: number; hole: number; above: number; ins: number; /** côté intérieur du compartiment caméra dans l'isolant du toit (0 = aucun) */ cam: number; /** deuxième caméra dans une mini boîte en contreplaqué, sous le toit à gauche, tournée vers le trou d'entrée ; longue nappe jusqu'au 2ᵉ port caméra du Pi */ cam2: boolean; /** lambris : une couche de lames verticales sur les quatre côtés du corps */ chene: boolean; /** planche de chêne de 18 mm posée sur le toit, qui déborde de 15 mm */ lambris: boolean; /** toit en pente (deux pans en diagonale sur les côtés, au-dessus du toit plat) */ pente: boolean; }
