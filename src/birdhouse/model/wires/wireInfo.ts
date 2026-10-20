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

interface Desc { ribbonCm?: number; from: string; to: string; role: string; voltage: string; current: string; connector: string; pins?: number[]; notes: string; fixedCord?: string; dupont?: boolean; section?: string }

const DUPONT = 'cordon Dupont femelle-femelle (côté Pi : picot du GPIO, aucune soudure)';
const SCREW = 'borne à vis du module (fil dénudé de 6 mm)';
const WAGO = 'Wago 221, sans outil (fil dénudé de 11 mm, levier)';
const IR_I = 'environ 66 mA par carte (2 branches de 2 LED à ≈ 33 mA, 68 Ω) ; jamais par un GPIO';
const FAN_PLUG = 'prise 4 broches d\'origine du ventilateur + rallonge 4 broches (emboîtées, aucune soudure)';
const SIG = 'quelques mA';

/** Table des descriptions : première expression qui reconnaît le nom. Ajouter ici toute nouvelle liaison (le test « fiche complète » échoue sinon). */
const TABLE: [RegExp, Desc][] = [
  [/^Nappe caméra 2/, { ribbonCm: 50, from: 'Raspberry Pi (2ᵉ port CSI)', to: 'Caméra 2 (dehors, sous le débord)', role: 'données de l\'image, bus CSI (MIPI)', voltage: '3,3 V logique, alimentation de la caméra comprise', current: SIG, connector: 'connecteur CSI à levier des deux côtés, sans outil', notes: 'Longue nappe plate de 16 mm : elle monte dans le canal du toit en okoumé (entre les deux plaques collées) : de l\'à-plomb de la caméra jusque dans le caisson, où elle rejoint le Pi. Ne jamais la plier à angle vif ni la croiser avec un fil.' }],
  [/^Nappe caméra$/, { from: 'Raspberry Pi (port CSI CAM0)', to: 'Caméra 1 (dans le nid)', role: 'données de l\'image, bus CSI (MIPI)', voltage: '3,3 V logique, alimentation de la caméra comprise', current: SIG, connector: 'connecteur CSI à levier des deux côtés, sans outil', notes: 'Courte nappe plate de 16 mm : elle passe par l\'ouverture du toit et arrive à l\'horizontale dans le connecteur du Pi.' }],
  [/^Fil 5 V LED extérieures/, { from: 'Raspberry Pi, broche 2 (5 V)', to: 'Carte de 4 LED infrarouges extérieures (+)', role: 'alimentation 5 V des LED, toujours présente', voltage: '5 V', current: IR_I, connector: DUPONT, pins: [2], dupont: true, notes: 'Longe la nappe de la caméra 2 sans jamais la croiser. Le 5 V reste direct ; c\'est la masse qui est commutée.' }],
  [/^Fil masse LED extérieures/, { from: 'Module MOSFET des LED extérieures, borne LOAD', to: 'Carte de 4 LED infrarouges extérieures (−)', role: 'masse commutée : le Pi allume ou éteint les LED en coupant cette masse', voltage: '5 V (chute du MOSFET)', current: IR_I, connector: SCREW, notes: 'Longe la nappe de la caméra 2 et suit le même canal du toit en okoumé.' }],
  [/^Fil masse module LED/, { from: 'Raspberry Pi, broche 6 (masse)', to: 'Modules MOSFET (GND, les deux modules)', role: 'masse du module, commune avec le Pi', voltage: '0 V', current: IR_I, connector: DUPONT, pins: [6], dupont: true, notes: 'Il faut une masse commune entre le Pi et le module pour que les commandes PWM soient comprises.' }],
  [/^Fil IN1 LED du nid/, { from: 'Raspberry Pi, GPIO23 (broche 16)', to: 'Module MOSFET des LED du nid (PWM)', role: 'commande 3,3 V des LED infrarouges du nid', voltage: '3,3 V logique', current: SIG, connector: DUPONT, pins: [16], dupont: true, notes: 'Niveau haut = LED du nid allumées (le MOSFET ferme leur masse).' }],
  [/^Fil IN2 LED extérieures/, { from: 'Raspberry Pi, GPIO24 (broche 18)', to: 'Module MOSFET des LED extérieures (PWM)', role: 'commande 3,3 V des LED infrarouges extérieures', voltage: '3,3 V logique', current: SIG, connector: DUPONT, pins: [18], dupont: true, notes: 'Niveau haut = LED extérieures allumées.' }],
  [/^Câble USB-C splitter/, { from: 'Splitter PoE+ (sortie USB-C 5 V)', to: 'Raspberry Pi 5 (prise USB-C d\'alimentation)', role: 'alimente le Pi en 5 V : le splitter PoE+ négocie le 5 V par USB-C', voltage: '5 V', current: '≈ 1,1 A (jusqu\'à 4,5 A selon le splitter)', connector: 'câble USB-C vers USB-C court (20 à 30 cm, de préférence coudé), à acheter : non fourni avec le splitter', notes: 'Il passe au-dessus du module MOSFET et arrive par le côté est du Pi.' }],
  [/^Gaine du câble Ethernet/, { from: 'Dessous du nichoir (coin arrière gauche)', to: 'Dessus du toit (splitter PoE+)', role: 'protège le câble Ethernet dans l\'isolant', voltage: '—', current: '—', connector: 'aucun : on enfile le câble dans la gaine avant de sertir la fiche RJ45', notes: 'Gaine annelée noire de Ø 16 dans le coin arrière gauche, à 5 mm des murs (le symétrique de l\'ancienne gaine du côté droit) : elle traverse le fond et le plancher par des trous de 16 mm, puis le cadre du toit et le fourreau par des trous de 18 mm.' }],
  [/^Câble Ethernet Cat6/, { from: 'Switch PoE+ (hors nichoir)', to: 'Splitter PoE+ (entrée PoE, dessus du toit)', role: 'courant PoE+ (48 V) et réseau dans un seul câble, entre par le dessous du nichoir et monte dans la gaine', voltage: '48 V PoE+ sur le câble ; le splitter sort du 5 V', current: '≤ 0,6 A (30 W PoE+ au plus)', connector: 'fiches RJ45 serties aux deux bouts, la fiche du nichoir APRÈS avoir tiré le câble dans la gaine', notes: 'Cat6 extérieur (gaine résistante aux UV), à poser avec un parafoudre et un presse-étoupe étanche ; 100 m au plus. Longueur de la 3D indicative : à mesurer sur place.', fixedCord: 'câble Cat6 extérieur de la longueur voulue (≤ 100 m), à acheter', section: 'câble réseau, 4 paires' }],
  [/^Cordon RJ45 switch/, { from: 'Switch PoE+', to: 'Serveur Pi 5 (prise Ethernet)', role: 'réseau : relie le Pi serveur au switch, donc au Pi du nichoir', voltage: '— (données seules)', current: SIG, connector: 'cordon RJ45 Cat6 court, à acheter', notes: 'Le serveur est dans la maison : longueur à mesurer sur place.', fixedCord: 'cordon RJ45 Cat6 du commerce, rien à couper', section: 'câble réseau, 4 paires' }],
  [/^Cordon RJ45 splitter/, { from: 'Splitter PoE+ (sortie de données RJ45)', to: 'Raspberry Pi 5 (prise Ethernet)', role: 'réseau : relie le Pi au switch PoE+ par le splitter (le Cat6 extérieur arrive sur l\'entrée PoE du splitter)', voltage: '— (données seules, le PoE reste dans le splitter)', current: SIG, connector: 'cordon RJ45 Cat6 court (25 à 30 cm), à acheter', notes: 'Passe au-dessus du Pi jusqu\'à sa prise Ethernet, côté plaque arrière. Position de la prise à confirmer sur la carte.', fixedCord: 'cordon RJ45 Cat6 de 30 cm, rien à couper' }],
  [/^Fil 3,3 V relais/, { from: 'Raspberry Pi, broche 17 (3,3 V, partagée avec la sonde de dehors)', to: 'Module relais 3 V (VCC)', role: 'alimente la bobine 3 V du relais', voltage: '3,3 V', current: '≈ 0,09 A quand le relais est collé', connector: DUPONT + ' ; un Wago 221-413 partage la broche 17 avec la sonde', pins: [17], dupont: true, notes: 'Cavaliers JP1 et JP2 en place : la bobine est alimentée par ce 3,3 V. Ne jamais brancher le 5 V sur ce module.' }],
  [/^Fil masse relais/, { from: 'Raspberry Pi, broche 25 (masse)', to: 'Module relais 3 V (GND)', role: 'masse du module, commune avec le Pi', voltage: '0 V (référence)', current: '≈ 0,09 A', connector: DUPONT, pins: [25], dupont: true, notes: 'Masse commune du Pi pour la commande et la bobine.' }],
  [/^Fil PWM ventilateur/, { from: 'Raspberry Pi, GPIO18 (broche 12)', to: 'Rallonge du ventilateur (PWM, fil bleu)', role: 'commande de vitesse PWM (25 kHz visé, repli 10 kHz)', voltage: '3,3 V logique', current: SIG, connector: DUPONT + ', rallonge Noctua à l\'autre bout', pins: [12], dupont: true, notes: 'Passe par-dessus la cassette, sur le dessus du toit. Le PWM est référencé à la masse du ventilateur : d\'où le fil de masse commune (broche 14).' }],
  [/^Fil tachymètre ventilateur/, { from: 'Raspberry Pi, GPIO17 (broche 11)', to: 'Rallonge du ventilateur (tachymètre, fil jaune)', role: 'retour de vitesse, 2 impulsions par tour', voltage: '3,3 V logique (collecteur ouvert)', current: SIG, connector: DUPONT + ', rallonge Noctua à l\'autre bout', pins: [11], dupont: true, notes: 'Tirage (pull-up) interne du GPIO17, logiciel.' }],
  [/^Fil masse commune ventilateur/, { from: 'Raspberry Pi, broche 14 (masse)', to: 'Rallonge du ventilateur (masse)', role: 'masse commune Pi / ventilateur (référence du PWM)', voltage: '0 V', current: SIG, connector: DUPONT + ', rallonge Noctua à l\'autre bout', pins: [14], dupont: true, notes: 'Masse commune entre le Pi, le ventilateur et le rail 12 V.' }],
  [/^Câble sonde extérieure/, { from: 'Sonde de température extérieure DS18B20 (sous le débord du toit, côté gauche)', to: 'Module DS18B20 (grenier, près du Pi)', role: 'liaison de la sonde de dehors : 3,3 V (rouge), masse (noir), donnée 1-Wire (jaune)', voltage: '3,3 V', current: '< 1 mA', connector: 'câble livré avec la sonde (1 m ou 3 m) : fils dans le bornier à vis du module (rien à souder)', fixedCord: 'câble livré avec la sonde : rien à acheter en plus (le trajet dessiné fait ≈ 15 cm, le surplus du câble s\'enroule dans le grenier)', notes: 'Il monte dans un canal oblong de 8 mm de la plaque crénelée du toit en okoumé (fermé par la plaque pleine), passe au-dessus du chant de la baguette gauche du couvercle et ressort dans le caisson, puis rejoint le module.' }],
  [/^Fil sonde 3,3 V/, { from: 'Raspberry Pi, broche 17 (3,3 V)', to: 'Module DS18B20 (VCC)', role: 'alimentation de la sonde extérieure', voltage: '3,3 V', current: '< 1 mA', connector: DUPONT, pins: [17], dupont: true, notes: 'La sonde se branche en 3,3 V (jamais en 5 V : la donnée irait vers un GPIO qui ne tolère que 3,3 V).' }],
  [/^Fil sonde DATA/, { from: 'Raspberry Pi, GPIO4 (broche 7)', to: 'Module DS18B20 (DATA)', role: 'donnée 1-Wire de la sonde extérieure', voltage: '3,3 V logique', current: SIG, connector: DUPONT, pins: [7], dupont: true, notes: 'La résistance de rappel de 4,7 kΩ entre DATA et 3,3 V est sur le module. Le 1-Wire doit être activé (dtoverlay=w1-gpio).' }],
  [/^Fil sonde masse/, { from: 'Raspberry Pi, broche 20 (masse)', to: 'Module DS18B20 (GND)', role: 'masse de la sonde extérieure', voltage: '0 V', current: '< 1 mA', connector: DUPONT, pins: [20], dupont: true, notes: 'Troisième fil de la sonde.' }],
  [/^Fil 3,3 V/, { from: 'Raspberry Pi, broche 1 (3,3 V)', to: 'Capteur BME280 (VIN)', role: 'alimentation du capteur de température et d\'humidité', voltage: '3,3 V', current: '< 1 mA', connector: DUPONT, pins: [1], dupont: true, notes: 'Liaison I2C à 4 fils ; le capteur est à fleur du plafond du nid, ses fils sortent par l\'ouverture du dessus du toit.' }],
  [/^Fil SDA/, { from: 'Raspberry Pi, GPIO2 SDA (broche 3)', to: 'Capteur BME280 (SDA)', role: 'données I2C du capteur', voltage: '3,3 V logique', current: SIG, connector: DUPONT, pins: [3], dupont: true, notes: 'Adresse I2C 0x76 ou 0x77.' }],
  [/^Fil SCL/, { from: 'Raspberry Pi, GPIO3 SCL (broche 5)', to: 'Capteur BME280 (SCL)', role: 'horloge I2C du capteur', voltage: '3,3 V logique', current: SIG, connector: DUPONT, pins: [5], dupont: true, notes: 'Adresse I2C 0x76 ou 0x77.' }],
  [/^Fil masse \(noir\)/, { from: 'Raspberry Pi, broche 9 (masse)', to: 'Capteur BME280 (GND)', role: 'masse du capteur', voltage: '0 V', current: '< 1 mA', connector: DUPONT, pins: [9], dupont: true, notes: 'Quatrième fil du capteur.' }],
  [/^Fil 5 V \(rouge\)/, { from: 'Raspberry Pi, broche 4 (5 V)', to: 'Carte de 4 LED infrarouges du nid (+)', role: 'alimentation 5 V des LED du nid, toujours présente', voltage: '5 V', current: IR_I, connector: DUPONT, pins: [4], dupont: true, notes: 'Le 5 V reste direct ; c\'est la masse (module MOSFET du nid, OUT−) qui est commutée.' }],
  [/^Câble d'origine du ventilateur/, { from: 'Ventilateur Noctua (dans la cassette)', to: "Prise 4 broches d'origine (femelle, sur le couvercle de la cassette)", role: 'les 4 fils du ventilateur dans une seule gaine noire : broche 1 masse, broche 2 +5 V, broche 3 tachymètre, broche 4 PWM (brochage standard des ventilateurs 4 broches)', voltage: '5 V sur la broche 2 ; 3,3 V logique sur le PWM et le tachymètre', current: '≈ 0,05 A', connector: "prise 4 broches d'origine, détrompée, aucune soudure", notes: "Câble vendu avec le Noctua (≈ 30 cm) : il monte du ventilateur et traverse le couvercle par un passage de 6 × 12 mm. Le câble est noir : les couleurs de ses fils ne sont pas à suivre, on branche par le numéro de broche de la prise.", fixedCord: "câble d'origine du ventilateur : rien à acheter ni à couper" }],
  [/^Fil Wago \+ → interrupteur/, { from: 'Wago 221-413 du rail 5 V (1ʳᵉ entrée)', to: 'Module relais 3 V (borne COM)', role: '5 V + du ventilateur, avant le relais', voltage: '5 V', current: '≈ 0,05 A', connector: WAGO + ' côté rail, ' + SCREW, notes: 'Le relais coupe le + : une masse coupée ferait remonter du 5 V vers les GPIO.' }],
  [/^Fil 5 V broche 4 → Wago/, { from: 'Raspberry Pi, broche 4 (5 V, déjà prise par le fil des LED du nid)', to: 'Wago 221-413 du rail 5 V (2ᵉ entrée)', role: '5 V du Pi vers le relais du ventilateur', voltage: '5 V', current: '≈ 0,1 A (ventilateur)', connector: DUPONT + ' ; ' + WAGO, pins: [4], dupont: true, notes: 'Deux fils sur la broche 4 (LED du nid et rail 5 V) : on enfile les deux dans le même picot ou on soude un Y. Vérifier le courant total sur la broche.' }],
  [/^Fil interrupteur → ventilateur/, { from: 'Module relais 3 V (borne NO)', to: 'Rallonge du ventilateur (prise mâle, +5 V)', role: '5 V commuté vers le ventilateur', voltage: '12 V (coupé à l\'arrêt)', current: '≈ 0,05 A', connector: FAN_PLUG, notes: 'Passe sur le dessus du toit ; la prise se débranche à la main pour sortir la cassette.' }],
  [/^Fil commande interrupteur/, { from: 'Raspberry Pi, GPIO27 (broche 13)', to: 'Module relais 3 V (IN)', role: 'marche / arrêt du 5 V du ventilateur', voltage: '3,3 V logique', current: SIG, connector: DUPONT, pins: [13], dupont: true, notes: 'Niveau haut = ventilateur alimenté (12 V d\'abord, puis 0,5 s plus tard le PWM).' }],
];

const COLOR_NAMES: [RegExp, string][] = [[/^#dc2626$/i, 'rouge'], [/^#111827$/i, 'noir'], [/^#1c1917$/i, 'noir'], [/^#2563eb$/i, 'bleu'], [/^#eab308$/i, 'jaune'], [/^#16a34a$/i, 'vert'], [/^#6b7280$/i, 'gris'], [/^#e5e7eb$/i, 'blanc'], [/^#f97316$/i, 'orange']];
const RIBBON_COLOR = '#f59e0b';

/** Nom français d'une couleur de fil (celle de la 3D) ; la couleur elle-même si elle n'est pas dans la table. */
export const colorName = (hex: string): string => COLOR_NAMES.find(([re]) => re.test(hex))?.[1] ?? hex;

/** Vrai pour les pièces qui ont une fiche de fil : fils, nappes et gaine. */
export const isWirePlank = (p: Plank): boolean => p.special === 'wire' || p.special === 'cable' || p.special === 'conduit';

/** Section de cuivre d'après le diamètre dessiné (Ø 3,6 = 2,5 mm² ; Ø 7 = câble 2 × 4 mm² ; en dessous, fil de signal ≈ 0,25 mm²). */
export function sectionFor(d: number): string {
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
const RIBBON_LENGTHS = [20, 30, 50]; // longueurs du câble caméra Raspberry Pi 5 chez Kubii : 200, 300 et 500 mm (200 mm = 1,32 €, 500 mm = 3,72 €)
const RIBBON_PRICE: Record<number, string> = { 20: '1,32 €', 50: '3,72 €' };

/** Pour deux fils nommés « Fil masse (noir) » : celui du capteur suit « Fil SCL (vert) », celui des LED du nid suit « Fil 5 V (rouge) » (ordre de `makeNest`) ; sans contexte, le capteur. */
function descFor(p: Plank, planks: Plank[]): Desc | undefined {
  if (p.name === 'Fil masse (noir)') {
    const i = planks.findIndex((x) => x.id === p.id);
    const prev = i > 0 ? planks[i - 1].name : '';
    return prev === 'Fil 5 V (rouge)' ? LED_GROUND : TABLE.find(([re]) => re.test(p.name))?.[1];
  }
  return TABLE.find(([re]) => re.test(p.name))?.[1];
}
const LED_GROUND: Desc = { from: 'Module MOSFET des LED du nid, borne LOAD', to: 'Carte de 4 LED infrarouges du nid (−)', role: 'masse commutée : le Pi allume ou éteint les LED du nid en coupant cette masse', voltage: '5 V (chute du MOSFET)', current: IR_I, connector: SCREW, notes: 'Ne va pas au Pi : elle passe par le module pour que le Pi puisse éteindre les LED.' };

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
  else if (kind === 'ribbon') { cordCm = d?.ribbonCm ?? RIBBON_LENGTHS.find((l) => l >= lengthCm + 2) ?? Math.ceil(lengthCm / 10) * 10 + 10; cordNote = `câble caméra Raspberry Pi 5 de ${cordCm} cm, 22 → 15 broches, 16 mm de large (Kubii${RIBBON_PRICE[cordCm] ? `, ${RIBBON_PRICE[cordCm]}` : ''}) : le trajet fait ${lengthCm} cm`; }
  else if (kind === 'conduit') { cordCm = Math.ceil((lengthCm + 2) / 5) * 5; cordNote = `gaine annelée Ø 16 de ${cordCm} cm`; }
  else { cordCm = cordFor(lengthCm, dupont); cordNote = dupont ? `${cordCm} cm (cordons Dupont F/F de 40 cm : on plie le surplus en S)` : `${cordCm} cm de fil (trajet ${lengthCm} cm + marge pour dénuder)`; }
  return {
    kind, known: !!d, name: p.name, color, colorName: kind === 'ribbon' ? 'orange (ruban)' : colorName(color),
    diameter: p.w, section: d?.section ?? (kind === 'ribbon' ? 'nappe plate, 15 ou 22 broches' : kind === 'conduit' ? 'gaine, pas de cuivre' : sectionFor(p.w)),
    lengthMm: Math.round(lengthMm * 10) / 10, lengthCm, cordCm, cordNote,
    from: d?.from ?? '', to: d?.to ?? '', role: d?.role ?? '', voltage: d?.voltage ?? '', current: d?.current ?? '', connector: d?.connector ?? '', pins: d?.pins ?? [], notes: d?.notes ?? '',
  };
}
