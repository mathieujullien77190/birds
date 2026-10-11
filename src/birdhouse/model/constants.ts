import { type Edge, type PlankScene, type NestParams } from './types';

export const EDGES: { id: Edge; label: string }[] = [
  { id: 'top', label: 'Haut' }, { id: 'bottom', label: 'Bas' }, { id: 'left', label: 'Gauche' }, { id: 'right', label: 'Droite' },
];

/** Taille de base d'une dent, en mm (boîtes et « Dents : auto »). */
export const TOOTH = 16;

export const DEFAULT_SCENE: PlankScene = { t: 3, fit: 0, planks: [], up: 'z2' }; // jeu 0 : crans ajustés exactement (le laser enlève déjà ~0,1 mm, ce qui donne le jeu)

export const NEST_DEFAULT: NestParams = { l: 120, L: 120, floorToHole: 130, hole: 28, above: 20, ins: 39, cam: 38, chene: false, lambris: true, pente: true, clim: true, solar: true, cam2: true }; // lambris et toit en pente : retirés pour le moment (cases « Lambris » et « Toit en pente » pour les remettre)


/** Module Peltier (TEC1-12706 : 40 × 40 × 3,8) : plaque froide alu 60 × 60 × 3 dans le nid, bloc alu 40 × 40 qui traverse l'isolant, Peltier, radiateur alu 60 × 60 à ailettes à l'extérieur. Hauteur du centre (z) sur le mur arrière. */
export const CLIM_Z = 170, TEC = 40, TEC_T = 3.8;
/** Système Peltier dans le toit, derrière le compartiment caméra : position y du centre du Peltier, et du compartiment caméra (décalé un peu vers l'avant, côté trou d'entrée). */
export const TEC_Y = 40, CAM_Y = -10, COLD = 60;
/** Compartiment du Peltier dans le toit (comme celui de la caméra) : sans isolant, ouvert au-dessus ; le dissipateur de 40 est dedans avec de l'air autour. */
/** Évacuation de l'eau de condensation : gouttère en diagonale sous la plaque froide (au fond du nid, en haut), trou dans les deux murs arrière, pile de carrés de bois percés qui traverse l'isolant. */
export const DRAIN_X = 50, DRAIN_Y = 50, DRAIN_S = 16, DRAIN_HOLE = 4; // trou d'évacuation dans le coin arrière droit, percé VERS LE BAS à travers le fond : Ø 4
export const TILT_DEG = 5; // inclinaison du bloc plaque froide + Peltier + dissipateur vers l'arrière
export const TECW = 70, TECD = 70, TEC_CX = 8, TEC_CY = 51; // largeur réduite à 70 (et recentrée) pour laisser 1 cm de chaque côté de la batterie // intérieur du compartiment du dissipateur (40) : réduit (2,5 cm d'air autour en x, un peu moins en y), décalé vers la droite pour laisser le coin arrière gauche au Raspberry Pi
/** Grande plaque froide en alu sous le plafond du nid : largeur (x), profondeur (y) et centre en y. */
export const COLD_W = 116, COLD_D = 43, COLD_Y = 38.5; // derrière le compartiment caméra (jusqu'à y = 17) et jusqu'au mur arrière (y = 60) : la caméra n'est PAS dans la plaque // COLD : côté de l'ancienne plaque froide (encore utilisé par le lambris)
/** Capteur température / humidité (carte type BME280 / DHT22, 15 × 11) fixé à l'intérieur du mur arrière, fils vers le GPIO du Pi. */
export const SENSOR_X = 30, SENSOR_Y = -17; // décalé de 1 cm vers le centre : la fente de ses fils (12 × 6 en x = 30,25) reste dans le compartiment, elle passait sous son mur droit (x = 43) // collé sous le plafond (le dessous du plancher du toit), à droite de la caméra, hors de la plaque alu

/** Trou de l'objectif dans le plafond intérieur, trou du câble dans le toit extérieur (mm). */
export const LENS_HOLE = 10;
/** Carte caméra Raspberry Pi (Module 3) : 25 × 24 mm. */
export const CAM_W = 25, CAM_H = 24;
/** Petite carte de 4 LED infrarouges 850 nm, posée à côté de la caméra : 12 × 24 mm. */
export const IR_W = 12, IR_H = 24;
/** Abscisses (centre) de la caméra et de la carte IR dans le compartiment : l'ensemble de 37 mm est centré. */
export const CAM_X = -6, IR_X = 12.5;
/** Deuxième caméra : mini boîte de 37 × 30 × 36 en contreplaqué posée À L'EXTÉRIEUR, sous le débord du toit en chêne, à l'avant gauche (centre en x = CAM2_X, y = CAM2_Y), inclinée et tournée pour viser le trou d'entrée ;
 *  une longue nappe sort du Pi par un trou de la plaque avant du toit. PI_CSI2 = connecteur du 2ᵉ port caméra du Pi dans le repère de la carte (provisoire : emplacement du port DSI du Pi 4 tant que le Pi 5 n'est pas intégré). */
export const CAM2_X = -72, CAM2_Y = -128, CAM2_L = 37, CAM2_D = 30, CAM2_H = 36;
export const PI_CSI2: [number, number] = [-38.5, 0];

/** Raspberry Pi 4 Model B (modèle 3D importé de public/models/pi4.bin) : carte de 85 × 56 mm, posée à plat sur le toit sur 3 mm de cales. */
export const PI_W = 85, PI_H = 56;
/** Boîtier étanche du Pi (posé sur le toit, 105 × 75 × 35, paroi 2,5) : transparent dans la vue pour voir la carte. */
export const CASE_W = 105, CASE_D = 68, CASE_H = 35, CASE_WALL = 2.5, CASE_FLOOR = 2.5;
/** Repères de la carte, dans le repère de la plaque (centre de la carte, x vers la droite, y vers l'arrière) : connecteur de la nappe caméra (dessus), broches du GPIO. */
export const PI_CSI: [number, number, number] = [4, -16.5, 6.1];
export const PI_PIN_Y = 25.77; // rangée extérieure du GPIO (broches paires : 2, 4, 6…)
export const PI_PIN_X0 = -35.4 + 1.27; // broche 2 (x de la première colonne)
