import { type PlankScene, type NestParams } from './types';

/** Taille de base d'une dent, en mm (boîtes et « Dents : auto »). */
export const TOOTH = 16;

export const DEFAULT_SCENE: PlankScene = { t: 3, fit: 0, planks: [], up: 'z2' }; // jeu 0 : crans ajustés exactement (le laser enlève déjà ~0,1 mm, ce qui donne le jeu)

export const NEST_DEFAULT: NestParams = { l: 120, L: 120, floorToHole: 130, hole: 32, above: 20, ins: 39, cam: 38, chene: false, lambris: true, pente: true, cam2: true }; // lambris et toit en pente : retirés pour le moment (cases « Lambris » et « Toit en pente » pour les remettre)


/** Position y du centre du compartiment caméra dans le toit (décalé un peu vers l'avant, côté trou d'entrée). */
export const CAM_Y = -10;
/** Ventilateur d'extraction (Noctua NF-A6x25 PWM : 60 × 60 × 25, 12 V) qui aspire l'air chaud du nid à travers le toit : cadre, hauteur, ouverture carrée du plafond (côté nid),
 *  hauteur des plots en caoutchouc entre le ventilateur et le plancher du toit. */
export const FAN = 60, FAN_T = 25, FAN_OPEN = 56, FAN_PLOT = 3;

/** Capteur température / humidité (carte type BME280 / DHT22, 15 × 11) fixé à l'intérieur du mur arrière, fils vers le GPIO du Pi. */
export const SENSOR_X = 36, SENSOR_Y = -14; // DANS le compartiment de la caméra (agrandi vers l'est) : ≥ 4,5 mm de bois entre son logement, la fenêtre des LED et les fentes des murs du compartiment ; // décalé de 1 cm vers le centre : la fente de ses fils (12 × 6 en x = 30,25) reste dans le compartiment, elle passait sous son mur droit (x = 43) // collé sous le plafond (le dessous du plancher du toit), à droite de la caméra, hors de la plaque alu

/** Trou de l'objectif dans le plafond intérieur, trou du câble dans le toit extérieur (mm). */
export const LENS_HOLE = 10;
/** Carte caméra Raspberry Pi (Module 3) : 25 × 24 mm. */
export const CAM_W = 25, CAM_H = 24;
/** Petite carte de 4 LED infrarouges 850 nm, posée à côté de la caméra : 12 × 24 mm. */
// Carte de 4 LED infrarouges FAITE MAISON : une plaque de prototypage 2 × 8 cm (pas de 2,54 mm, trous de Ø 1 mm) coupée à 3 colonnes × 12 rangées ; 4 LED de 3 mm 850 nm (YIXISI : corps de 5,3 mm, 1,3-1,5 V, 50 mA max)
// en 2 branches de 2 LED en série (colonnes 1 et 3, la colonne 2 reste vide entre elles), chacune avec une résistance de 68 Ω. Repère de la carte : colonnes 1 à 3 de gauche à droite, rangées 1 à 12 de haut en bas, vue de la face où l'on soude (dessus).
export const IR_PITCH = 2.54, IR_W = 7.7, IR_H = 30.5, IR_ROWS = 12, IR_LED_LEN = 5.3, IR_LIFT = 3; // pas, largeur (2 pas + 2,6 de bord), longueur (11 pas + 2,6), rangées, longueur du corps d'une LED, hauteur des deux cales sous la carte (le bout des LED arrive à 0,7 mm sous un bois de 3 mm)
/** Centre (mm, repère de la carte, origine au milieu) du trou de colonne `col` (1 à 3) et de rangée `row` (1 à 12). */
export const irHole = (col: number, row: number): [number, number] => [Math.round((col - 2) * IR_PITCH * 100) / 100, Math.round((row - (IR_ROWS + 1) / 2) * IR_PITCH * 100) / 100];
/** Les 4 LED : [colonne, rangée de l'anode] ; la cathode est dans la rangée suivante, de la même colonne. LED 1 et 2 : branche de la colonne 1 ; LED 3 et 4 : branche de la colonne 3. */
export const IR_LED_HOLES: [number, number][] = [[1, 7], [1, 9], [3, 7], [3, 9]];
/** Centre d'une LED (milieu de ses deux pattes). */
export const irLedCenter = ([col, row]: [number, number]): [number, number] => { const [x, y] = irHole(col, row), [, y2] = irHole(col, row + 1); return [x, Math.round(((y + y2) / 2) * 100) / 100]; };
/** Les 2 résistances de 68 Ω : sous la carte, couchées le long des colonnes 1 et 3, pattes dans les rangées 3 et 6. */
export const IR_R_COLS = [1, 3], IR_R_ROWS = [3, 6];
/** Les deux cales de 3 mm sous les bouts de la carte : ordonnées de leur centre (5 mm de profondeur chacune). */
export const IR_SHIM_Y = [-13.25, 12.5];
/** Fenêtre à percer dans le bois pour les 4 LED (centrée sur le groupe de LED, 0,4 mm de jeu autour des corps de 3 mm) : largeur (colonnes), longueur (rangées), centre. */
export const IR_WIN = { w: 8.9, h: 8.9, cx: 0, cy: 5.08 };
/** Abscisses (centre) de la caméra et de la carte IR dans le compartiment : l'ensemble de 37 mm est centré. */
export const CAM_X = 0, IR_X = 18.5; // objectif centré à droite / gauche sur le plafond (x = 0), carte des LED 18,5 mm à sa droite
/** Épaisseur du contreplaqué okoumé extérieur peint en blanc (habillage), en mm. */
export const OKOUME_T = 5, OKOUME_COLOR = '#f5f5f4';
/** Okoumé NON peint (brun-rosé chaud) : le pan du toit, que l'utilisateur sature lui-même pour l'extérieur (l'habillage, lui, est peint en blanc : `OKOUME_COLOR`). */
export const OKOUME_NATURAL = '#c98f69';
/** Deuxième caméra : NUE, À L'EXTÉRIEUR, sous le débord du toit en okoumé, à l'avant gauche, inclinée et tournée pour viser le trou d'entrée (boîte en okoumé essayée puis retirée). Une longue nappe sort du Pi par une fente de la plaque avant du toit.
 *  PI_CSI2 = le connecteur de GAUCHE des deux ports de 22 broches du Pi 5 (caméra 2), dans le repère de la carte. Les deux connecteurs de 22 broches du Pi 5 (CAM/DISP 0 et 1) sont côte à côte sur le bord long, entre la 2ᵉ micro-HDMI et le bloc Ethernet :
 *  positions lues sur le dessin mécanique officiel (https://pip.raspberrypi.com/documents/RP-008347-DS-raspberry-pi-5-mechanical-drawing.pdf, dimensions approximatives, non cotées : mesurées sur le dessin à l'échelle 1:1) :
 *  centres à ≈ 48,7 mm et ≈ 55,0 mm du bord gauche, ≈ 8,5 mm du bord avant. Le sens d'entrée de la nappe (côté du levier) n'est pas lisible sur le dessin : à vérifier sur la carte réelle. */
export const PI_CSI2: [number, number] = [-42.5 + 48.7, -28 + 8.5];

/** Raspberry Pi 5 : carte de 85 × 56 mm , posée à plat sur le toit sur 3 mm de cales. Le dessin 3D (public/models/pi5.bin) vient du STEP du Pi 5. */
export const PI_W = 85, PI_H = 56;
/** Boîtier du Pi (hauteur et paroi, mm) : transparent dans la vue pour voir la carte. */
export const CASE_H = 35, CASE_WALL = 2.5;
/** Repères de la carte, dans le repère de la plaque (centre de la carte, x vers la droite, y vers l'arrière) : connecteur de la nappe caméra (dessus), broches du GPIO.
 *  PI_CSI = le connecteur de DROITE des deux ports de 22 broches du Pi 5 (caméra 1 ; le plus près des prises, x ≈ 55,0 mm du bord gauche, y ≈ 8,5 mm du bord avant, même source que PI_CSI2) ; la hauteur (6,1) est celle du dessin 3D, non cotée sur le plan officiel. */
export const PI_CSI: [number, number, number] = [-42.5 + 55.0, -28 + 8.5, 6.1];
export const PI_PIN_Y = 25.77; // rangée extérieure du GPIO (broches paires : 2, 4, 6…)
export const PI_PIN_X0 = -35.4 + 1.27; // broche 2 (x de la première colonne)
export const SENSOR_CHIP_DX = -1.5; // décalage de la puce par rapport au centre de la carte du capteur (sensor.ts)

/** Planche de découpe par défaut (mm) et marge sur ses bords : une seule source pour le réglage de la découpe laser (`DEFAULT_CUT_CFG`) et pour la longueur des baguettes de cale. */
export const DEFAULT_SHEET = { W: 400, H: 320, margin: 8 }; // planche = zone de gravure de la Sculpfun E1 Pro (400 × 320 mm ; le matériau posé peut faire 450 × 350) : le contreplaqué de 400 × 400 du commerce se recoupe à 400 × 320 ; les curseurs de « Découpe laser » changent la taille
/** Baguettes de cale (contreplaqué 3 mm) : longueur MAX qui tient sur toutes les planches courantes, 410 × 400, 400 × 400 comme 400 × 320 (le sens de la longueur est celui de la largeur : plus petite dimension utile = 384), largeur, écart de rangement au sol, et facteur du besoin (on en fait le triple). */
export const STRIP = { length: 384, width: 5, pitch: 15, spare: 3 };

/**
 * Pièces fines de rechange : une plaque découpée (contreplaqué, MDF ou okoumé ; jamais un composant `special`) est FINE quand son plus petit côté (boîte englobante du contour)
 * ou sa « largeur moyenne » (2 × aire / périmètre du contour, trous exclus) est au plus `maxWidth` mm : baguettes, poignées en U, étriers, clavettes, parois du conduit de sortie…
 * Chacune a `copies` exemplaires de rechange identiques, rangés à plat à côté du nichoir (carrés de `gap` mm entre eux, rangées de `rowWidth` mm au plus).
 */
export const THIN = { maxWidth: 12, copies: 3, gap: 6, rowWidth: 400 };
