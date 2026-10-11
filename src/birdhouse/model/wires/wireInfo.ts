import type { Plank } from '../types';
import { polylineLength, roundPoints } from './path';

/** Fiche d'un fil, d'une nappe ou de la gaine : tout ce qu'il faut pour le couper, le brancher et le vérifier. Fonction pure, aucune dépendance à three.js. */
export interface WireInfo {
  kind: 'wire' | 'ribbon' | 'conduit';
  /** Le nom de la pièce a été reconnu dans la table des descriptions (sinon les textes sont vides et `known` est faux). */
  known: boolean;
  name: string;
  /** Couleur de dessin (`#rrggbb`) et son nom en français. */
  color: string;
  colorName: string;
  /** Diamètre extérieur dessiné (mm) ; largeur pour une nappe. */
  diameter: number;
  /** Section de cuivre correspondante (texte), ou le format de la nappe / de la gaine. */
  section: string;
  /** Longueur du trajet dessiné (mm, coudes arrondis comme dans la 3D), et en cm au dixième. */
  lengthMm: number;
  lengthCm: number;
  /** Longueur à prévoir à l'achat (cm) : cordon standard ou fil avec marge ; `null` quand le câble est fourni (câble d'origine). */
  cordCm: number | null;
  cordNote: string;
  from: string;
  to: string;
  role: string;
  voltage: string;
  current: string;
  connector: string;
  /** Broches physiques du GPIO du Pi citées par ce fil (vide s'il n'en touche aucune). */
  pins: number[];
  notes: string;
}

interface Desc { from: string; to: string; role: string; voltage: string; current: string; connector: string; pins?: number[]; notes: string; fixedCord?: string; dupont?: boolean }

const DUPONT = 'cordon Dupont femelle-femelle (côté Pi : picot du GPIO, aucune soudure)';
const SCREW = 'borne à vis du module (fil dénudé de 6 mm)';
const WAGO = 'Wago 221, sans outil (fil dénudé de 11 mm, levier)';
const IR_I = 'quelques centaines de mA selon la carte (à déterminer, jamais par un GPIO)';
const FAN_PLUG = 'prise 4 broches d\'origine du ventilateur + rallonge 4 broches (emboîtées, aucune soudure)';
const SIG = 'quelques mA';

/** Table des descriptions : première expression qui reconnaît le nom. Ajouter ici toute nouvelle liaison (le test « fiche complète » échoue sinon). */
const TABLE: [RegExp, Desc][] = [
  [/^Câble 12 V/, { from: 'Panneau solaire (boîte de jonction au dos)', to: 'Régulateur de charge (bornier panneau, sous le nichoir)', role: '12 V solaire, + et − dans un seul câble à deux conducteurs', voltage: '≈ 17 à 18 V à puissance max, 21 à 22 V à vide', current: '≈ 5,8 A au plus (panneau 100 W)', connector: 'MC4 côté panneau, borne à vis du régulateur côté charge', notes: 'Longe le sol et arrive sous le nichoir, à l\'abri du lambris ; câble de Ø 7 mm, 2 × 4 mm² environ.' }],
  [/^Nappe caméra 2/, { from: 'Raspberry Pi (2ᵉ port CSI)', to: 'Caméra 2 (dehors, sous le débord)', role: 'données de l\'image, bus CSI (MIPI)', voltage: '3,3 V logique, alimentation de la caméra comprise', current: SIG, connector: 'connecteur CSI à levier des deux côtés, sans outil', notes: 'Longue nappe plate de 16 mm : elle sort par la fente 20 × 4 de la plaque avant du toit. Ne jamais la plier à angle vif ni la croiser avec un fil.' }],
  [/^Nappe caméra$/, { from: 'Raspberry Pi (port CSI CAM0)', to: 'Caméra 1 (dans le nid)', role: 'données de l\'image, bus CSI (MIPI)', voltage: '3,3 V logique, alimentation de la caméra comprise', current: SIG, connector: 'connecteur CSI à levier des deux côtés, sans outil', notes: 'Courte nappe plate de 16 mm : elle passe par l\'ouverture du toit et arrive à l\'horizontale dans le connecteur du Pi.' }],
  [/^Gaine des fils/, { from: 'Dessous du nichoir (régulateur)', to: 'Dessus du toit (fusible)', role: 'protège les deux fils de charge dans l\'isolant', voltage: '—', current: '—', connector: 'aucun : on enfile les fils dans la gaine avant de les brancher', notes: 'Gaine annelée noire de Ø 16 dans le coin arrière droit, traverse le fond, les planchers et le cadre du toit par des trous de 16 mm (serrés).' }],
  [/^Fil 5 V LED extérieures/, { from: 'Raspberry Pi, broche 2 (5 V)', to: 'Carte de 4 LED infrarouges extérieures (+)', role: 'alimentation 5 V des LED, toujours présente', voltage: '5 V', current: IR_I, connector: DUPONT, pins: [2], dupont: true, notes: 'Longe la nappe de la caméra 2 sans jamais la croiser. Le 5 V reste direct ; c\'est la masse qui est commutée.' }],
  [/^Fil masse LED extérieures/, { from: 'Module 2 × MOSFET, sortie OUT2', to: 'Carte de 4 LED infrarouges extérieures (−)', role: 'masse commutée : le Pi allume ou éteint les LED en coupant cette masse', voltage: '5 V (chute du MOSFET)', current: IR_I, connector: SCREW, notes: 'Longe la nappe de la caméra 2 et sort par la même fente.' }],
  [/^Fil masse module LED/, { from: 'Raspberry Pi, broche 6 (masse)', to: 'Module 2 × MOSFET (GND)', role: 'masse du module, commune avec le Pi', voltage: '0 V', current: IR_I, connector: DUPONT, pins: [6], dupont: true, notes: 'Il faut une masse commune entre le Pi et le module pour que les commandes IN1 / IN2 soient comprises.' }],
  [/^Fil IN1 LED du nid/, { from: 'Raspberry Pi, GPIO23 (broche 16)', to: 'Module 2 × MOSFET (IN1)', role: 'commande 3,3 V des LED infrarouges du nid', voltage: '3,3 V logique', current: SIG, connector: DUPONT, pins: [16], dupont: true, notes: 'Niveau haut = LED du nid allumées (le MOSFET ferme leur masse).' }],
  [/^Fil IN2 LED extérieures/, { from: 'Raspberry Pi, GPIO24 (broche 18)', to: 'Module 2 × MOSFET (IN2)', role: 'commande 3,3 V des LED infrarouges extérieures', voltage: '3,3 V logique', current: SIG, connector: DUPONT, pins: [18], dupont: true, notes: 'Niveau haut = LED extérieures allumées.' }],
  [/^Fil fusible → batterie/, { from: 'Fusible 15 A (sortie)', to: 'Batterie LiFePO4 (borne +, face arrière)', role: '12 V +, charge et décharge de la batterie', voltage: '12,8 V nominal (10 à 14,6 V)', current: '≤ 10 A en charge, ≈ 8 A en décharge (fusible 15 A)', connector: 'cosse ou embout vissé sur la borne de la batterie', notes: 'Gros fil de puissance (2,5 mm²) : le plus court possible. Le fusible se place au plus près du + de la batterie.' }],
  [/^Fil fusible → Wago/, { from: 'Fusible 15 A', to: 'Wago 221-413 du + (entrée du milieu)', role: '12 V + vers le rail', voltage: '12,8 V nominal', current: '≈ 1 A', connector: WAGO, notes: 'Part du fusible droit dans l\'axe de l\'entrée du Wago. Tirer légèrement sur le fil après l\'avoir serré.' }],
  [/^Fil batterie − → Wago/, { from: 'Batterie (borne −)', to: 'Wago 221-415 du − (4ᵉ entrée)', role: 'masse du rail 12 V', voltage: '0 V (référence)', current: '≈ 1 A', connector: WAGO, notes: 'Le − de la batterie arrive du sud. La masse est commune entre le Pi, le ventilateur (broche 14) et le rail.' }],
  [/^Fil rail → convertisseur \+/, { from: 'Wago 221-413 du + (3ᵉ entrée)', to: 'Convertisseur 12 → 5 V (entrée +)', role: 'alimente le convertisseur, donc le Pi', voltage: '12,8 V nominal', current: '≈ 0,6 A (le Pi consomme ≈ 3,5 W)', connector: WAGO + ' côté rail, borne à vis côté convertisseur', notes: 'Départ n° 2 du Wago +. Passe au-dessus de tout jusqu\'au coin avant gauche.' }],
  [/^Fil rail → convertisseur −/, { from: 'Wago 221-415 du − (3ᵉ entrée)', to: 'Convertisseur 12 → 5 V (entrée −)', role: 'retour du convertisseur', voltage: '0 V (référence)', current: '≈ 0,6 A', connector: WAGO + ' côté rail, borne à vis côté convertisseur', notes: 'Départ n° 2 du Wago −.' }],
  [/^Fil régulateur → batterie \+/, { from: 'Régulateur de charge (sortie charge +, sous le nichoir)', to: 'Fusible, puis batterie (+)', role: '12 V + de charge, monte par la gaine de Ø 16', voltage: '12 à 14,6 V', current: '≤ 6 A (panneau 100 W)', connector: 'borne à vis du régulateur (embout), côté fusible : porte-fusible à fils', notes: 'Fil de 2,5 mm² (Ø 3,6 dessiné). Il passe avec le fil − dans la gaine ; ne croise aucun autre fil.' }],
  [/^Fil régulateur → batterie −/, { from: 'Régulateur de charge (sortie charge −, sous le nichoir)', to: 'Batterie (borne −), par le Wago −', role: 'masse de charge, monte par la gaine de Ø 16', voltage: '0 V (référence)', current: '≤ 6 A (panneau 100 W)', connector: 'borne à vis du régulateur (embout), cosse sur la batterie', notes: 'Fil de 2,5 mm² (Ø 3,6 dessiné), même gaine que le fil +.' }],
  [/^Fil 3,3 V/, { from: 'Raspberry Pi, broche 1 (3,3 V)', to: 'Capteur BME280 (VIN)', role: 'alimentation du capteur de température et d\'humidité', voltage: '3,3 V', current: '< 1 mA', connector: DUPONT, pins: [1], dupont: true, notes: 'Liaison I2C à 4 fils ; le capteur est à fleur du plafond du nid, ses fils sortent par l\'ouverture du dessus du toit.' }],
  [/^Fil SDA/, { from: 'Raspberry Pi, GPIO2 SDA (broche 3)', to: 'Capteur BME280 (SDA)', role: 'données I2C du capteur', voltage: '3,3 V logique', current: SIG, connector: DUPONT, pins: [3], dupont: true, notes: 'Adresse I2C 0x76 ou 0x77.' }],
  [/^Fil SCL/, { from: 'Raspberry Pi, GPIO3 SCL (broche 5)', to: 'Capteur BME280 (SCL)', role: 'horloge I2C du capteur', voltage: '3,3 V logique', current: SIG, connector: DUPONT, pins: [5], dupont: true, notes: 'Adresse I2C 0x76 ou 0x77.' }],
  [/^Fil masse \(noir\)/, { from: 'Raspberry Pi, broche 9 (masse)', to: 'Capteur BME280 (GND)', role: 'masse du capteur', voltage: '0 V', current: '< 1 mA', connector: DUPONT, pins: [9], dupont: true, notes: 'Quatrième fil du capteur.' }],
  [/^Fil 5 V \(rouge\)/, { from: 'Raspberry Pi, broche 4 (5 V)', to: 'Carte de 4 LED infrarouges du nid (+)', role: 'alimentation 5 V des LED du nid, toujours présente', voltage: '5 V', current: IR_I, connector: DUPONT, pins: [4], dupont: true, notes: 'Le 5 V reste direct ; c\'est la masse (module MOSFET, OUT1) qui est commutée.' }],
  [/^Fil cassette \+/, { from: 'Ventilateur Noctua (dans la cassette)', to: 'Prise 4 broches d\'origine (+12 V)', role: '12 V commuté du ventilateur', voltage: '12 V', current: '≈ 0,05 A', connector: 'câble d\'origine du ventilateur', notes: 'Câble d\'origine du Noctua (≈ 30 cm) : il monte du ventilateur et traverse le couvercle par un passage de 6 × 12 mm.', fixedCord: 'câble d\'origine du ventilateur : rien à acheter ni à couper' }],
  [/^Fil cassette PWM/, { from: 'Ventilateur Noctua (dans la cassette)', to: 'Prise 4 broches d\'origine (PWM)', role: 'commande de vitesse PWM', voltage: '3,3 V logique, 25 kHz', current: SIG, connector: 'câble d\'origine du ventilateur', notes: 'Fil bleu du Noctua.', fixedCord: 'câble d\'origine du ventilateur : rien à acheter ni à couper' }],
  [/^Fil cassette tachymètre/, { from: 'Ventilateur Noctua (dans la cassette)', to: 'Prise 4 broches d\'origine (tachymètre)', role: 'retour de vitesse (2 impulsions par tour)', voltage: '3,3 V logique (collecteur ouvert)', current: SIG, connector: 'câble d\'origine du ventilateur', notes: 'Fil jaune du Noctua.', fixedCord: 'câble d\'origine du ventilateur : rien à acheter ni à couper' }],
  [/^Fil cassette −/, { from: 'Ventilateur Noctua (dans la cassette)', to: 'Prise 4 broches d\'origine (masse)', role: 'masse du ventilateur', voltage: '0 V', current: '≈ 0,05 A', connector: 'câble d\'origine du ventilateur', notes: 'Fil noir du Noctua.', fixedCord: 'câble d\'origine du ventilateur : rien à acheter ni à couper' }],
  [/^Fil Wago \+ → interrupteur/, { from: 'Wago 221-413 du + (1ʳᵉ entrée)', to: 'Module interrupteur 12 V (entrée)', role: '12 V + du ventilateur, avant l\'interrupteur', voltage: '12,8 V nominal', current: '≈ 0,05 A', connector: WAGO + ' côté rail, ' + SCREW, notes: 'L\'interrupteur est côté + (high-side) : une masse coupée ferait remonter 12 V vers les GPIO.' }],
  [/^Fil interrupteur → ventilateur/, { from: 'Module interrupteur 12 V (sortie)', to: 'Rallonge du ventilateur (prise mâle, +12 V)', role: '12 V commuté vers le ventilateur', voltage: '12 V (coupé à l\'arrêt)', current: '≈ 0,05 A', connector: FAN_PLUG, notes: 'Passe sur le dessus du toit ; la prise se débranche à la main pour sortir la cassette.' }],
  [/^Fil ventilateur −/, { from: 'Rallonge du ventilateur (prise mâle, masse)', to: 'Wago 221-415 du − (2ᵉ entrée)', role: 'masse du ventilateur', voltage: '0 V (référence)', current: '≈ 0,05 A', connector: FAN_PLUG + ' ; ' + WAGO, notes: 'Retour du ventilateur vers le rail.' }],
  [/^Fil masse interrupteur/, { from: 'Module interrupteur 12 V (masse)', to: 'Wago 221-415 du − (1ʳᵉ entrée)', role: 'masse du module interrupteur', voltage: '0 V (référence)', current: '< 10 mA', connector: SCREW + ' côté module, ' + WAGO + ' côté rail', notes: 'Masse commune avec le rail 12 V.' }],
  [/^Fil PWM ventilateur/, { from: 'Raspberry Pi, GPIO18 (broche 12)', to: 'Rallonge du ventilateur (PWM, fil bleu)', role: 'commande de vitesse PWM (25 kHz visé, repli 10 kHz)', voltage: '3,3 V logique', current: SIG, connector: DUPONT + ', rallonge Noctua à l\'autre bout', pins: [12], dupont: true, notes: 'Passe par-dessus la cassette, sur le dessus du toit. Le PWM est référencé à la masse du ventilateur : d\'où le fil de masse commune (broche 14).' }],
  [/^Fil tachymètre ventilateur/, { from: 'Raspberry Pi, GPIO17 (broche 11)', to: 'Rallonge du ventilateur (tachymètre, fil jaune)', role: 'retour de vitesse, 2 impulsions par tour', voltage: '3,3 V logique (collecteur ouvert)', current: SIG, connector: DUPONT + ', rallonge Noctua à l\'autre bout', pins: [11], dupont: true, notes: 'Tirage (pull-up) interne du GPIO17, logiciel.' }],
  [/^Fil masse commune ventilateur/, { from: 'Raspberry Pi, broche 14 (masse)', to: 'Rallonge du ventilateur (masse)', role: 'masse commune Pi / ventilateur (référence du PWM)', voltage: '0 V', current: SIG, connector: DUPONT + ', rallonge Noctua à l\'autre bout', pins: [14], dupont: true, notes: 'Masse commune entre le Pi, le ventilateur et le rail 12 V.' }],
  [/^Fil commande interrupteur/, { from: 'Raspberry Pi, GPIO27 (broche 13)', to: 'Module interrupteur 12 V (commande)', role: 'marche / arrêt du 12 V du ventilateur', voltage: '3,3 V logique', current: SIG, connector: DUPONT, pins: [13], dupont: true, notes: 'Niveau haut = ventilateur alimenté (12 V d\'abord, puis 0,5 s plus tard le PWM).' }],
];

const COLOR_NAMES: [RegExp, string][] = [[/^#dc2626$/i, 'rouge'], [/^#111827$/i, 'noir'], [/^#1c1917$/i, 'noir'], [/^#2563eb$/i, 'bleu'], [/^#eab308$/i, 'jaune'], [/^#16a34a$/i, 'vert'], [/^#6b7280$/i, 'gris'], [/^#e5e7eb$/i, 'blanc'], [/^#f97316$/i, 'orange']];
const RIBBON_COLOR = '#f59e0b';

/** Nom français d'une couleur de fil (celle de la 3D) ; la couleur elle-même si elle n'est pas dans la table. */
export const colorName = (hex: string): string => COLOR_NAMES.find(([re]) => re.test(hex))?.[1] ?? hex;

/** Vrai pour les pièces qui ont une fiche de fil : fils, nappes et gaine. */
export const isWirePlank = (p: Plank): boolean => p.special === 'wire' || p.special === 'cable' || p.special === 'conduit';

/** Section de cuivre d'après le diamètre dessiné (Ø 3,6 = 2,5 mm² ; Ø 7 = câble 2 × 4 mm² ; en dessous, fil de signal ≈ 0,25 mm²). */
export function sectionFor(d: number): string {
  if (d >= 6) return '≈ 4 mm² par conducteur (câble à deux conducteurs)';
  if (d >= 3) return '2,5 mm²';
  return '≈ 0,25 mm²';
}

/** Longueur du trajet (mm) : les coudes des fils sont arrondis comme dans la 3D (rayon 10 mm, 4 × le diamètre pour les gros fils), les nappes et la gaine suivent leurs points. */
export function pathLength(p: Plank): number {
  const pts = p.path ?? [];
  return polylineLength(p.special === 'wire' ? roundPoints(pts, Math.max(10, 4 * p.w)) : pts);
}

/** Cordon à acheter : Dupont standard de 20 / 30 / 40 cm (« 40 cm partout » dans le document, plus long si le trajet l'exige) ; fil libre : trajet + 6 cm de marge (dénuder, serrer), arrondi aux 5 cm. */
const cordFor = (cm: number, dupont: boolean): number => (dupont ? Math.max(40, Math.ceil(cm / 10) * 10) : Math.ceil((cm + 6) / 5) * 5);

/** Nappe CSI : longueurs courantes du commerce (cm). */
const RIBBON_LENGTHS = [5, 10, 15, 20, 30, 50, 100];

/** Pour deux fils nommés « Fil masse (noir) » : celui du capteur suit « Fil SCL (vert) », celui des LED du nid suit « Fil 5 V (rouge) » (ordre de `makeNest`) ; sans contexte, le capteur. */
function descFor(p: Plank, planks: Plank[]): Desc | undefined {
  if (p.name === 'Fil masse (noir)') {
    const i = planks.findIndex((x) => x.id === p.id);
    const prev = i > 0 ? planks[i - 1].name : '';
    return prev === 'Fil 5 V (rouge)' ? LED_GROUND : TABLE.find(([re]) => re.test(p.name))?.[1];
  }
  return TABLE.find(([re]) => re.test(p.name))?.[1];
}
const LED_GROUND: Desc = { from: 'Module 2 × MOSFET, sortie OUT1', to: 'Carte de 4 LED infrarouges du nid (−)', role: 'masse commutée : le Pi allume ou éteint les LED du nid en coupant cette masse', voltage: '5 V (chute du MOSFET)', current: IR_I, connector: SCREW, notes: 'Ne va pas au Pi : elle passe par le module pour que le Pi puisse éteindre les LED.' };

/**
 * Fiche d'un fil, d'une nappe ou de la gaine (`null` pour une autre pièce). Longueur, diamètre et section viennent de la pièce elle-même (chemin, `w`, couleur) ;
 * les extrémités, le rôle, la tension, le courant et le raccord viennent de la table ci-dessus, d'après le nom. `planks` (la scène) ne sert qu'à départager deux fils de même nom.
 */
export function wireInfo(p: Plank, planks: Plank[] = []): WireInfo | null {
  if (!isWirePlank(p)) return null;
  const kind = p.special === 'cable' ? 'ribbon' : p.special === 'conduit' ? 'conduit' : 'wire';
  const d = descFor(p, planks);
  const lengthMm = pathLength(p);
  const lengthCm = Math.round(lengthMm / 10 * 10) / 10;
  const color = p.color ?? RIBBON_COLOR;
  const dupont = !!d?.dupont;
  let cordCm: number | null, cordNote: string;
  if (d?.fixedCord) { cordCm = null; cordNote = d.fixedCord; }
  else if (kind === 'ribbon') { cordCm = RIBBON_LENGTHS.find((l) => l >= lengthCm + 2) ?? Math.ceil(lengthCm / 10) * 10 + 10; cordNote = `nappe CSI plate de ${cordCm} cm (la plus courte du commerce qui convient)`; }
  else if (kind === 'conduit') { cordCm = Math.ceil((lengthCm + 2) / 5) * 5; cordNote = `gaine annelée Ø 16 de ${cordCm} cm`; }
  else { cordCm = cordFor(lengthCm, dupont); cordNote = dupont ? `${cordCm} cm (cordons Dupont F/F de 40 cm : on plie le surplus en S)` : `${cordCm} cm de fil (trajet ${lengthCm} cm + marge pour dénuder)`; }
  return {
    kind, known: !!d, name: p.name, color, colorName: kind === 'ribbon' ? 'orange (ruban)' : colorName(color),
    diameter: p.w, section: kind === 'ribbon' ? 'nappe plate, 15 ou 22 broches' : kind === 'conduit' ? 'gaine, pas de cuivre' : sectionFor(p.w),
    lengthMm: Math.round(lengthMm * 10) / 10, lengthCm, cordCm, cordNote,
    from: d?.from ?? '', to: d?.to ?? '', role: d?.role ?? '', voltage: d?.voltage ?? '', current: d?.current ?? '', connector: d?.connector ?? '', pins: d?.pins ?? [], notes: d?.notes ?? '',
  };
}
