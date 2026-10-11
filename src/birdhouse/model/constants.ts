import { type PlankScene, type NestParams } from './types';

/** Taille de base d'une dent, en mm (boîtes et « Dents : auto »). */
export const TOOTH = 16;

export const DEFAULT_SCENE: PlankScene = { t: 3, fit: 0, planks: [], up: 'z2' }; // jeu 0 : crans ajustés exactement (le laser enlève déjà ~0,1 mm, ce qui donne le jeu)

export const NEST_DEFAULT: NestParams = { l: 120, L: 120, floorToHole: 130, hole: 32, above: 20, ins: 39, cam: 38, chene: false, lambris: true, pente: true, solar: true, cam2: true }; // lambris et toit en pente : retirés pour le moment (cases « Lambris » et « Toit en pente » pour les remettre)


/** Position y du centre du compartiment caméra dans le toit (décalé un peu vers l'avant, côté trou d'entrée). */
export const CAM_Y = -10;
/** Ventilateur d'extraction (Noctua NF-A6x25 PWM : 60 × 60 × 25, 12 V) qui aspire l'air chaud du nid à travers le toit : cadre, hauteur, ouverture carrée du plafond (côté nid),
 *  hauteur des plots en caoutchouc entre le ventilateur et le plancher du toit. */
export const FAN = 60, FAN_T = 25, FAN_OPEN = 56, FAN_PLOT = 3;

/** Capteur température / humidité (carte type BME280 / DHT22, 15 × 11) fixé à l'intérieur du mur arrière, fils vers le GPIO du Pi. */
export const SENSOR_X = 33, SENSOR_Y = -14; // DANS le compartiment de la caméra (agrandi vers l'est) : ≥ 4,5 mm de bois entre son logement, la fenêtre des LED et les fentes des murs du compartiment ; // décalé de 1 cm vers le centre : la fente de ses fils (12 × 6 en x = 30,25) reste dans le compartiment, elle passait sous son mur droit (x = 43) // collé sous le plafond (le dessous du plancher du toit), à droite de la caméra, hors de la plaque alu

/** Trou de l'objectif dans le plafond intérieur, trou du câble dans le toit extérieur (mm). */
export const LENS_HOLE = 10;
/** Carte caméra Raspberry Pi (Module 3) : 25 × 24 mm. */
export const CAM_W = 25, CAM_H = 24;
/** Petite carte de 4 LED infrarouges 850 nm, posée à côté de la caméra : 12 × 24 mm. */
export const IR_W = 12, IR_H = 24;
/** Abscisses (centre) de la caméra et de la carte IR dans le compartiment : l'ensemble de 37 mm est centré. */
export const CAM_X = -6, IR_X = 12.5;
/** Épaisseur du contreplaqué okoumé extérieur peint en blanc (habillage), en mm. */
export const OKOUME_T = 5, OKOUME_COLOR = '#f5f5f4';
/** Deuxième caméra : NUE, À L'EXTÉRIEUR, sous le débord du toit en chêne, à l'avant gauche, inclinée et tournée pour viser le trou d'entrée (boîte en okoumé essayée puis retirée). Une longue nappe sort du Pi par une fente de la plaque avant du toit.
 *  PI_CSI2 = connecteur du 2ᵉ port caméra du Pi dans le repère de la carte (provisoire : emplacement du port DSI du Pi 4 tant que le Pi 5 n'est pas intégré). */
export const PI_CSI2: [number, number] = [-38.5, 0];

/** Raspberry Pi 4 Model B (modèle 3D importé de public/models/pi4.bin) : carte de 85 × 56 mm, posée à plat sur le toit sur 3 mm de cales. */
export const PI_W = 85, PI_H = 56;
/** Boîtier du Pi (hauteur et paroi, mm) : transparent dans la vue pour voir la carte. */
export const CASE_H = 35, CASE_WALL = 2.5;
/** Repères de la carte, dans le repère de la plaque (centre de la carte, x vers la droite, y vers l'arrière) : connecteur de la nappe caméra (dessus), broches du GPIO. */
export const PI_CSI: [number, number, number] = [4, -16.5, 6.1];
export const PI_PIN_Y = 25.77; // rangée extérieure du GPIO (broches paires : 2, 4, 6…)
export const PI_PIN_X0 = -35.4 + 1.27; // broche 2 (x de la première colonne)
export const SENSOR_CHIP_DX = -1.5; // décalage de la puce par rapport au centre de la carte du capteur (sensor.ts)
