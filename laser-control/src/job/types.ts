/** Format neutre d'un travail de découpe : ce que `buildGcode` consomme, quelle que soit l'origine (SVG, logiciel de CAO, autre application). */

/** Polyligne fermée en millimètres (le dernier point revient au premier sans être répété). Origine = coin BAS-GAUCHE de la planche, X à droite, Y vers le haut. */
export type Polyline = [number, number][];

/** Une pièce : son nom et ses contours (le plus grand = extérieur, les autres = trous). Sert à couper les trous avant l'extérieur, petites pièces d'abord. */
export interface LaserPiece { name: string; contours: Polyline[] }

export interface LaserJob {
  /** Taille de la planche (mm). */
  widthMm: number;
  heightMm: number;
  layers: {
    /** Contours à couper. Sans `pieces`, leur imbrication (un contour dans un autre = un trou) donne l'ordre de coupe. */
    cut: Polyline[];
    /** Contours à graver (trait léger, avant la coupe). */
    engrave?: Polyline[];
  };
  /** Les mêmes contours de coupe regroupés par pièce (ordre de coupe exact). Facultatif. */
  pieces?: LaserPiece[];
  /** Rectangle du cadre à vide « autour des pièces » si on veut un autre que l'encombrement des contours (pièces entières, par exemple). */
  frame?: { minX: number; minY: number; maxX: number; maxY: number };
  /** Titre écrit dans l'en-tête du fichier G-code. */
  title?: string;
}

/**
 * Un programme proposé au pilotage : une planche à couper (`job`) ou un G-code déjà prêt (`gcode`, envoyé tel quel, plafond de puissance appliqué).
 */
export interface LaserItem {
  /** Nom affiché (« Planche 1 », « maquette.svg »). */
  label: string;
  /** Nom du fichier .gcode téléchargé, sans extension. */
  fileName: string;
  job?: LaserJob;
  gcode?: string;
  /** Remarque affichée sous l'aperçu du trajet. */
  notice?: string;
}
