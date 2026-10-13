/**
 * Textes des étapes de finition et d'installation. Ils reprennent `docs/schema-electronique.md` (« Finition du bois », « Montage sans soudure »,
 * fiches des composants), `docs/logiciel.md` et `pi/README.md` : rien n'est inventé ici.
 */

/** Saturateur du toit en okoumé : section « Finition du bois (saturateur, peinture) ». */
export const SAT_TEXT = [
  "Saturateur à l'eau Luxens teck mat sur les deux plaques d'okoumé du toit. Essai sur une chute avant de traiter : c'est un gel anti-glisse conçu pour les terrasses.",
  "- Appliquer uniquement sur les pièces du toit, à l'extérieur, jamais sur ce qui touche le nid.",
  '- Masquer au ruban de peintre les surfaces à coller (face de dessus de la plaque crénelée, dents, fentes).',
  '- 2 couches, chants compris.',
  "Étiquette : « dangereux : respecter les précautions d'emploi ».",
].join('\n');

/** Séchage du saturateur. */
export const SAT_DRY = [
  "- Séchage au toucher : 1 h (selon l'étiquette) ; laisser sécher entre les deux couches.",
  '- Enlever le ruban avant de coller.',
].join('\n');

/** Peinture blanche de l'habillage. */
export const PAINT_TEXT = [
  'Peinture extérieure bois / MDF / OSB « Conditions extrêmes » Luxens, blanc satiné (RAL 9016), sans sous-couche sur bois neuf. Peindre les 22 lames avant de les coller.',
  '- 2 faces et les chants, 2 couches.',
  '- Masquer au ruban de peintre les surfaces à coller.',
  "- Nettoyer les outils à l'eau.",
  "Étiquette : « dangereux : respecter les précautions d'emploi ».",
].join('\n');

/** Ponçage des lames de l'habillage, avant la peinture : arrondi des arêtes entre les planches. */
export const SAND_TEXT = [
  "Poncer chaque lame sur toute sa longueur (papier de verre grain 120, puis 180) pour arrondir légèrement les deux arêtes longues de la face visible.",
  "- Une fois les lames collées côte à côte, ces arrondis dessinent un petit joint en creux entre les planches : visuellement, c'est plus joli.",
  "- Ne pas arrondir les bouts des lames ni leurs faces de collage : elles restent planes.",
  "- Dépoussiérer avant de peindre.",
].join('\n');

/** Séchage de la peinture de l'habillage. */
export const PAINT_DRY = [
  "- Au toucher : 12 h (selon l'étiquette).",
  "- Entre deux couches : 6 h (selon l'étiquette).",
  "- Sec complètement : 12 h (selon l'étiquette), puis enlever le ruban et coller les lames.",
].join('\n');

export const FAB_IR = [
  'Deux cartes de LED infrarouges, faites à la main (une pour le plafond du nid, une pour la caméra extérieure) :',
  '- Couper dans une plaque de prototypage de 2 × 8 cm (pas de 2,54 mm) une carte de 3 colonnes × 12 rangées (≈ 7,7 × 30,5 mm) : scie fine ou cutter à 1,3 mm des trous du bord, masque et lunettes, aspirateur à côté ; ne jamais couper au laser.',
  '- Souder 4 LED infrarouges de 3 mm (850 nm, 1,3 à 1,5 V, 50 mA maximum) côté dessous, la patte longue (anode, +) vers le haut de la carte : 2 branches de 2 LED en série (colonnes 1 et 3), chacune avec une résistance de 68 Ω (environ 33 mA par branche sous 5 V). Détail trou par trou : section « Fabrication des cartes de LED infrarouges (pas à pas) » du dossier.',
  '- Souder 2 fils : rouge (5 V) au milieu de la rangée des résistances, noir (masse) au milieu de la rangée des cathodes ; les deux branches sont réunies par des ponts d\'étain.',
  '- Tester avant de coller quoi que ce soit : la carte sous 5 V, regardée avec l\'appareil photo d\'un téléphone (l\'infrarouge y apparaît en violet clair) ; si une LED ne s\'allume pas, elle est à l\'envers.',
  '- La carte sera posée par ses deux bouts sur deux cales de 3 mm (morceaux de baguette de 8 mm) : le bout des LED (corps de 5,3 mm) arrive alors à 0,7 mm sous le dessous du bois.',
].join('\n');

export const TEST_MULTIMETER = [
  'Avant la mise sous tension, au multimètre :',
  '- continuité sur le rail 12 V ;',
  '- jamais de court-circuit entre le + et le − du rail.',
  'Tirer légèrement sur chaque fil après l\'avoir serré : s\'il bouge, le bornier ou le Wago n\'est pas bien fermé.',
].join('\n');

export const TEST_BATTERY = [
  'Le panneau solaire reste débranché. Brancher la batterie, avec son fusible et le régulateur de charge en place.',
  '- La batterie LiFePO4 4S se situe autour de 12,8 V (14,6 V au plus à la charge, coupure basse vers 10 à 10,5 V).',
  '- Le convertisseur alimente le Pi : la page `http://<ip-du-pi>:8080` répond, avec le niveau de la batterie.',
  '- Refaire en vrai les essais de l\'établi : capteurs, caméras, LED, ventilateur (marche, arrêt, tr/min).',
].join('\n');
