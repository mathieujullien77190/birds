import type { AssemblyBlock, AssemblyKind } from './types';
import { PAINT_DRY, PAINT_TEXT, SAND_TEXT, SAT_DRY, SAT_TEXT, TEST_BATTERY, TEST_MULTIMETER } from './texts';

/** Blocs du montage, dans l'ordre. */
export const ASSEMBLY_BLOCKS: AssemblyBlock[] = [
  { id: 'hiver', title: "Pièces d'hiver" },
  { id: 'aeration', title: 'Aération du corps' },
  { id: 'nid', title: 'Nid' },
  { id: 'corps', title: 'Corps' },
  { id: 'entree', title: 'Entrée' },
  { id: 'zonecam', title: 'Zone caméra' },
  { id: 'goulotte', title: 'Goulotte ventilateur' },
  { id: 'cassette', title: 'Cassette du ventilateur' },
  { id: 'toit', title: 'Toit' },
  { id: 'habillage', title: 'Habillage' },
  { id: 'couvercle', title: 'Couvercle' },
  { id: 'baguettes', title: 'Baguettes de cale' },
  { id: 'elec', title: 'Électronique : composants et fils' },
  { id: 'essais', title: 'Électronique : essais avec la batterie' },
  { id: 'solaire', title: 'Panneau solaire' },
  { id: 'divers', title: 'Autres pièces' },
];

/** Donne la référence d'une pièce de la scène dans un texte : « Nom » (CODE). */
export type Ref = (re: RegExp) => string;
export type Text = string | ((ref: Ref) => string);

/** Étape qui pose des pièces : toutes celles dont le nom correspond à `re` et qui n'ont pas déjà été prises. */
export interface PieceRule {
  id: string; block: string; kind: AssemblyKind; re: RegExp;
  /** Ne prend que les `limit` premières pièces (deux fils portent le même nom). */
  limit?: number;
  /** Toutes les pièces prises dans UNE étape (séries : plots, bloc d'entrée…) ; sinon une étape par pièce, les pièces identiques (même code) ensemble. */
  all?: boolean;
  title?: string; text?: Text;
}
/** Étape de texte : aucune pièce posée, `focus` désigne les pièces concernées (affichées et surlignées). */
export interface NoteRule { id: string; block: string; kind: AssemblyKind; title: string; text: Text; focus?: RegExp[] }
export type Rule = PieceRule | NoteRule;

const P = (id: string, block: string, kind: AssemblyKind, re: RegExp, o: { limit?: number; all?: boolean; title?: string; text?: Text } = {}): PieceRule => ({ id, block, kind, re, ...o });
const N = (id: string, block: string, kind: AssemblyKind, title: string, text: Text, focus?: RegExp[]): NoteRule => ({ id, block, kind, title, text, focus });

/** Pièces du couvercle en okoumé (soulevé pendant l'installation de l'électronique). */
export const LID_RE = /^(Toit en okoumé|Baguette couvercle)/;
/** Étape après laquelle le toit en okoumé est de nouveau posé. */
export const LID_BACK = 'elec-pose-toit';

/** Sous-ensembles montés à part dans leur propre bloc, puis posés d'un bloc par une étape de texte : pièces, bloc de montage, étape de pose. */
export const SUBASSEMBLIES: { re: RegExp; block: string; put: string }[] = [
  { re: /^Conduit d'air/, block: 'aeration', put: 'corps-module-air' },
  { re: /^(Face avant|Face arrière|Côté droit|Côté gauche) int$|^Pièce en C sous le cadre|^Plaque isolant entrée/, block: 'nid', put: 'corps-nid-pose' },
  { re: /^(Face (avant|arrière)|Côté (droit|gauche)) caméra 1$/, block: 'zonecam', put: 'toit-zone-camera' },
  { re: /^Goulotte ventilateur (gauche|droite|avant)$/, block: 'goulotte', put: 'toit-goulotte' },
  { re: /^(Cassette ventilateur|Grille de protection ventilateur|Plot caoutchouc ventilateur|Ventilateur Noctua|Poignée cassette|Prise 4 broches du ventilateur|Câble d'origine du ventilateur|Conduit de sortie)/, block: 'cassette', put: 'toit-cassette' },
];

export const SEQ: Rule[] = [
  // ---- b. Pièces d'hiver (rechange) ----
  P('hiv-fond', 'hiver', 'placer', /^Bloc isolant d'hiver fond/, { text: "Bloc d'hiver : même empreinte que la cassette du ventilateur, boîte pleine fermée, sans aucune ouverture." }),
  P('hiv-12', 'hiver', 'emboiter', /^Bloc isolant d'hiver [12]$/),
  P('hiv-34', 'hiver', 'emboiter', /^Bloc isolant d'hiver [34]$/),
  P('hiv-mousse', 'hiver', 'isoler', /^Isolant bloc d'hiver/, { text: 'Mousse de 35 mm, enfermée dans la boîte.' }),
  P('hiv-couvercle', 'hiver', 'emboiter', /^Bloc isolant d'hiver couvercle/),
  P('hiv-poignee', 'hiver', 'coller', /^Poignée bloc d'hiver/, { text: 'U de contreplaqué : trois couches de 3 mm collées face à face (9 mm), pieds dans les fentes du couvercle. Pièce de rechange : en hiver, le bloc remplace la cassette du ventilateur.' }),
  P('hiv-bouchon-fond', 'hiver', 'placer', /^Bouchon-boîte prise d'air fond/, { text: "Sous-boîte isolante (bouchon de la prise d'air basse) : elle passe pile dans l'intérieur libre du conduit d'air, sans ouverture." }),
  P('hiv-bouchon-12', 'hiver', 'emboiter', /^Bouchon-boîte prise d'air [12]$/),
  P('hiv-bouchon-34', 'hiver', 'emboiter', /^Bouchon-boîte prise d'air [34]$/),
  P('hiv-laine', 'hiver', 'isoler', /^Laine bouchon prise d'air/),
  P('hiv-bouchon-couvercle', 'hiver', 'emboiter', /^Bouchon-boîte prise d'air couvercle/),
  P('hiv-bouchon-poignee', 'hiver', 'coller', /^Poignée bouchon prise d'air/, { text: "Poignée en U de trois couches de 3 mm, pieds dans deux fentes du fond ; elle dépasse sous le fond pour ressortir la sous-boîte." }),

  // ---- a. Aération du corps : le module (conduit de la prise d'air basse), monté en sous-ensemble ----
  P('aer-2', 'aeration', 'placer', /^Conduit d'air 2$/, { text: (r) => `Côté nid : sa fente de 34 × 30 mm se place en face de la grille de ${r(/^Côté gauche int$/)}.` }),
  P('aer-34', 'aeration', 'emboiter', /^Conduit d'air [34]$/),
  P('aer-1', 'aeration', 'emboiter', /^Conduit d'air 1$/),
  P('aer-5', 'aeration', 'emboiter', /^Conduit d'air 5/),

  // ---- a'. Nid : les 4 parois intérieures, montées à part sur l'établi, puis posées d'un bloc dans le corps ----
  P('nid-c', 'nid', 'placer', /^Pièce en C sous le cadre/, { title: 'Pièce en C (base du nid)', text: (r) => [
    `Le nid se monte à part, sur l'établi, en commençant par ${r(/^Pièce en C sous le cadre/)} : posée à plat, c'est la base sur laquelle les quatre parois intérieures s'emboîtent une à une.`,
    "Pièce en C crénelée de 3 mm : ses dents reçoivent les parois du nid (et celles des quatre parois extérieures, plus tard) ; elle enferme l'isolant sous le cadre du toit. Elle revient vers l'entrée des deux côtés et ne laisse que l'ouverture du bloc d'entrée, qui reste enlevable par le haut. La gaine la traverse par un trou de Ø 18 mm.",
    "Le nid terminé (pièce en C + 4 parois) se pose ensuite d'un bloc dans le corps (étape « Poser le nid dans le corps »).",
  ].join('\n') }),
  P('nid-droit', 'nid', 'emboiter', /^Côté droit int$/, { text: (r) => `Première paroi : ses dents du haut entrent dans les fentes de ${r(/^Pièce en C sous le cadre/)}. Ses dents du bas serviront plus tard à s'enfoncer dans ${r(/^Plancher int$/)}.` }),
  P('nid-gauche', 'nid', 'emboiter', /^Côté gauche int$/, { text: (r) => `Deuxième paroi, en face de la première : dents du haut dans la pièce en C. La grille de ${r(/^Côté gauche int$/)} (six fentes de 4 mm) est tournée vers le nid ; le module d'aération se colle contre sa face extérieure.` }),
  P('nid-arriere', 'nid', 'emboiter', /^Face arrière int$/, { text: 'Emboîter les dents des angles avec les deux côtés, dents du haut dans la pièce en C.' }),
  P('nid-avant', 'nid', 'emboiter', /^Face avant int$/, { text: 'Dernière paroi : elle ferme la boîte. Emboîter les dents des angles avec les deux côtés, dents du haut dans la pièce en C ; son encoche reste ouverte vers le haut pour le bloc d\'entrée.' }),
  P('nid-liner', 'nid', 'emboiter', /^Plaque isolant entrée (gauche|droite)$/, { all: true, title: "Plaques qui cachent l'isolant, de chaque côté du bloc d'entrée", text: (r) => `Les deux plaques debout (COR-16) bordent le puits du bloc d'entrée, juste après ${r(/^Face avant int$/)} : crénelées aux deux bouts, leurs dents du côté du nid entrent dans les fentes de cette paroi et le plat du bout se colle contre elle ; leur haut se colle à plat sous la pièce en C, alignées sur les flancs de son ouverture, sans y entrer. Leurs dents côté extérieur recevront ${r(/^Face avant ext$/)} plus tard.` }),
  P('nid-liner-dessous', 'nid', 'emboiter', /^Plaque isolant entrée dessous$/, { text: (r) => `À plat entre les deux plaques, sous le bloc d'entrée (COR-17), crénelée aux deux bouts : ses dents entrent dans ${r(/^Face avant int$/)} et le plat se colle contre elle ; ${r(/^Face avant ext$/)} se pose plus tard sur ses dents extérieures. Le nid est alors terminé.` }),

  // ---- c. Corps ----
  P('corps-dessous', 'corps', 'placer', /^Dessous ext$/, { text: "À plat. Son ouverture rectangulaire laisse passer plus tard le module d'aération." }),
  P('corps-iso-bas', 'corps', 'isoler', /^Isolant sous le plancher/, { all: true, text: "L'isolation du bas se met AVANT le module d'aération, qui la traverse : les quatre pièces se posent ensemble sous le fond." }),
  N('corps-module-air', 'corps', 'installer', "Poser le module d'aération (déjà monté)", "Le module est monté à part (bloc « Aération du corps ») : on le pose d'un bloc, déjà assemblé, après l'isolant du plancher.", [/^Conduit d'air/]),
  P('corps-plancher', 'corps', 'emboiter', /^Plancher int$/, { text: "Ses dents traversent les fentes des murs extérieurs. Il n'a que le passage du conduit d'air." }),
  N('corps-nid-pose', 'corps', 'installer', 'Poser le nid dans le corps (déjà monté)', "Le nid se monte à part (bloc « Nid ») : on le pose d'un bloc (pièce en C, quatre parois et plaques de l'entrée, déjà assemblées), sur le plancher intérieur ; les dents du bas des quatre parois entrent dans les fentes du plancher.", [/^(Face avant|Face arrière|Côté droit|Côté gauche) int$|^Pièce en C sous le cadre|^Plaque isolant entrée/]),
  P('corps-iso-nid', 'corps', 'isoler', /^Isolant (gauche|droite$|arrière$|avant gauche$|avant droite$|sous le bloc d'entrée$)/, { all: true, title: "Isolant autour du nid et du bloc d'entrée", text: "Tous les isolants du corps se posent d'un coup : ceux qui entourent le nid et ceux qui entourent le bloc d'entrée (sous le bloc, avant gauche et avant droite). APRÈS le module d'aération et AVANT toutes les parois extérieures (COR-04 à COR-07) : on pose d'abord tout l'isolant. La gaine des fils se poussera dans la laine plus tard, après la paroi arrière. Le bloc d'entrée lui-même se pose plus tard." }),
  P('corps-avant-ext', 'corps', 'emboiter', /^Face avant ext$/, { text: (r) => `Ne pas monter ${r(/^Côté gauche ext$/)} maintenant : c'est la dernière paroi du corps, après toutes les autres. L'isolant est déjà en place : les parois extérieures se posent ensuite, COR-04 puis COR-05, la gaine, COR-06.` }),
  P('corps-arriere-ext', 'corps', 'emboiter', /^Face arrière ext$/),
  P('corps-gaine', 'corps', 'installer', /^Gaine des fils/, { text: [
    "À passer APRÈS la paroi arrière (COR-05) et AVANT la paroi du côté droit (COR-06), entre l'isolant déjà posé. Elle monte dans le coin arrière droit, à 1 cm du mur arrière, et traverse des trous de Ø 16 mm, serrés, dans le fond et le plancher intérieur, puis plus tard des trous de Ø 18 mm dans les trois planches du cadre du toit, le dessous et le dessus du toit.",
    "L'isolant n'est pas découpé autour : on pousse la gaine dans la laine.",
  ].join('\n') }),
  P('corps-droit-ext', 'corps', 'emboiter', /^Côté droit ext$/),
  P('corps-nervures', 'corps', 'coller', /^Fixation arbre/, { text: 'Chaque nervure est faite de trois plaques collées face à face. Les dents traversent les fentes du mur arrière extérieur et ressortent de 6 mm dans l\'isolant, avec un trou de 3 × 20 mm pour la clavette. Soigner le collage.' }),
  P('corps-clavettes', 'corps', 'coller', /^Clavette fixation/, { text: 'Chaque clavette traverse les trois plaques de sa nervure par le trou de 3 × 20 mm et les verrouille contre la face intérieure du mur, sans espace.' }),
  P('corps-gauche-ext', 'corps', 'emboiter', /^Côté gauche ext$/, { text: "Dernière paroi du corps : le module d'aération et l'isolation sont en place." }),
  P('corps-etriers', 'corps', 'coller', /^Étrier régulateur/, { text: 'Les tenons des bras traversent le fond par des fentes de 8 × 3 mm et affleurent son dessus : ils tiendront le régulateur sous le nichoir. Le régulateur se fixe dessous après le montage du corps.' }),
  P('corps-etriers-bat', 'corps', 'coller', /^Étrier batterie/, { text: 'Quatre étriers identiques, à l\'arrière gauche, plaques debout dans le sens de la largeur de la batterie (elle est tournée de 90° : ses 128 mm vont de gauche à droite) : leurs tenons traversent le fond par des fentes de 5 × 3 mm et affleurent son dessus ; ils tiendront la batterie sous le nichoir, à plat. Dernières pièces du corps.' }),

  // ---- d. Entrée et isolant restant ----
  P('ent-bloc', 'entree', 'placer', /^Entrée \d+$/, { all: true, title: "Empiler le bloc d'entrée", text: (r) => [
    `Empiler les carrés percés dans l'ordre, du dehors vers le nid (${r(/^Entrée 1$/)} affleure le mur extérieur, le dernier affleure la face intérieure) : rien ne dépasse.`,
    "Le bloc coulisse de haut en bas dans l'encoche des deux faces avant, toit retiré.",
  ].join('\n') }),

  // ---- d'. Zone caméra : les 4 murs du compartiment, assemblés à part puis posés d'un bloc dans le toit ----
  P('zc-av-ar', 'zonecam', 'placer', /^Face (avant|arrière) caméra 1$/, { text: 'Compartiment de la caméra : les quatre murs s\'emboîtent entre eux sur l\'établi ; leurs dents du bas traverseront ensuite les fentes du plancher du toit.' }),
  P('zc-cotes', 'zonecam', 'emboiter', /^Côté (droit|gauche) caméra 1$/),

  // ---- d''. Goulotte du ventilateur : le siège fixe, assemblé à part ----
  P('gl-avant', 'goulotte', 'placer', /^Goulotte ventilateur avant$/, { text: "Siège du ventilateur : la paroi avant et les deux côtés s'emboîtent par leurs arêtes verticales crénelées pour former un U, d'un seul bloc ; il n'y a aucune dent à l'arrière, où la plaque arrière du toit fait la quatrième paroi." }),
  P('gl-cotes', 'goulotte', 'emboiter', /^Goulotte ventilateur (gauche|droite)$/),

  // ---- d'''. Cassette du ventilateur : montée à part (ventilateur, grille, plots, câble, conduit de sortie), glissée ensuite dans la goulotte ----
  P('cass-cadre', 'cassette', 'placer', /^Cassette ventilateur cadre du bas/, { text: 'Cassette du ventilateur : amovible à la main, sans outil ni vis. Quatre parois emboîtées par leurs arêtes verticales ; le cadre du bas et le couvercle s\'emboîtent dans les parois.' }),
  P('cass-parois-1', 'cassette', 'emboiter', /^Cassette ventilateur 1$/),
  P('cass-parois-2', 'cassette', 'emboiter', /^Cassette ventilateur 2$/),
  P('cass-parois-34', 'cassette', 'emboiter', /^Cassette ventilateur [34]$/),
  P('cass-grille', 'cassette', 'placer', /^Grille de protection ventilateur/, { text: 'Sur le cadre du bas, entre le cadre et le ventilateur : elle sort avec la cassette.' }),
  P('cass-plots', 'cassette', 'placer', /^Plot caoutchouc ventilateur/, { all: true, text: 'Quatre plots en caoutchouc de 12 × 2 × 3 mm posés sur le cadre : les vibrations ne passent que par eux.' }),
  P('cass-ventilateur', 'cassette', 'placer', /^Ventilateur Noctua/),
  P('cass-fils', 'cassette', 'cabler', /^Câble d'origine du ventilateur/, { text: "Le câble noir vendu avec le ventilateur (quatre fils dans une gaine, déjà fixé au ventilateur) se pose d'abord, AVANT le couvercle et la poignée : il sort vers le haut et traversera le passage de 12 × 6 mm du couvercle. Il finit par une prise 4 broches femelle (broche 1 masse, broche 2 +12 V, broche 3 tachymètre, broche 4 PWM), collée sur la tranche avant du couvercle." }),
  P('cass-couvercle', 'cassette', 'emboiter', /^Cassette ventilateur couvercle/),
  P('cass-poignee', 'cassette', 'coller', /^Poignée cassette/, { text: 'U de contreplaqué : trois couches de 3 mm collées face à face (9 mm), pieds dans deux fentes du couvercle.' }),
  P('cass-prise', 'cassette', 'placer', /^Prise 4 broches du ventilateur/, { text: "Le câble d'origine du ventilateur monte dans la cassette, traverse le couvercle par un passage de 12 × 6 mm et finit par cette prise femelle, collée sur la tranche avant du couvercle." }),
  P('cass-sortie-12', 'cassette', 'emboiter', /^Conduit de sortie [12]$/, { text: 'Conduit de sortie : ses dents entrent dans les fentes de la paroi arrière de la cassette, contre la fenêtre. Il sort et rentre avec elle.' }),
  P('cass-sortie-34', 'cassette', 'emboiter', /^Conduit de sortie [34]$/),

  // ---- e. Toit ----
  P('toit-dessous', 'toit', 'placer', /^Dessous toit$/),
  P('toit-avant', 'toit', 'emboiter', /^Face avant toit$/),
  P('toit-plaque-camera', 'toit', 'emboiter', /^Plaque caméra extérieure$/, { text: (r) => `Plaque horizontale, perpendiculaire à la façade, au-dessus du trou d'envol, au centre : ses dents entrent dans les fentes de ${r(/^Face avant toit$/)} et elle dépasse devant, sous le débord du toit. Elle porte, dans un grand trou presque de la taille de la carte, l'objectif de la caméra extérieure et, dans une fenêtre, les LED (à fleur). Elle est collée au toit (1 mm sous le pan) et traverse l'habillage : la lame d'entrée s'arrête sous elle, sans habillage au-dessus.` }),
  P('toit-arriere', 'toit', 'emboiter', /^Face arrière toit$/),
  P('toit-cote-droit', 'toit', 'emboiter', /^Côté droit toit$/),
  P('toit-fourreau', 'toit', 'coller', /^Fourreau gaine toit/, { all: true, title: 'Fourreau de la gaine dans le toit', text: "Treize petits carrés percés de Ø 18 mm, empilés et collés sur le dessous du toit autour du trou de la gaine, dans le coin arrière droit, juste après la plaque du côté droit du toit (T-06) : ils tiennent la gaine à travers l'isolant jusqu'au dessus du toit." }),
  P('toit-cote-gauche', 'toit', 'emboiter', /^Côté gauche toit$/),
  N('toit-zone-camera', 'toit', 'installer', 'Poser la zone caméra (déjà montée)', "La zone caméra se monte à part (bloc « Zone caméra ») : on la pose d'un bloc dans les fentes du plancher du toit.", [/^(Face (avant|arrière)|Côté (droit|gauche)) caméra 1$/]),
  N('toit-goulotte', 'toit', 'installer', 'Poser la goulotte du ventilateur (déjà montée)', "La goulotte se monte à part (bloc « Goulotte ventilateur ») : ses dents du bas se posent d'un bloc dans les fentes du plancher du toit ; la plaque arrière du toit fait la quatrième paroi.", [/^Goulotte ventilateur (gauche|droite|avant)$/]),
  N('toit-cassette', 'toit', 'installer', 'Glisser la cassette dans la goulotte', "La cassette se monte à part (bloc « Cassette du ventilateur ») ; elle se glisse par le haut dans la goulotte. Elle est taillée pile, sans jeu : si elle passe mal, la poncer légèrement (papier de verre grain 120 puis 180, sur les faces qui frottent) jusqu'à ce qu'elle coulisse sans forcer ; la prise d'origine (femelle) s'emboîte sur la prise mâle collée sur la face avant de la goulotte ; la rallonge se branche ensuite. On la retire à la main par le haut, après avoir débranché la prise 4 broches.", [/^Cassette ventilateur/]),
  P('toit-bag-cotes', 'toit', 'coller', /^Baguette dessus toit (gauche|droite)$/, { text: 'Les baguettes se posent à plat contre la face intérieure des plaques du toit, dents dans les fentes : elles portent « Dessus toit ».' }),
  P('toit-bag-avant', 'toit', 'coller', /^Baguette dessus toit avant$/),
  P('toit-bag-arriere-1', 'toit', 'coller', /^Baguette dessus toit arrière 1$/, { text: 'La baguette arrière est en deux morceaux : elle contourne le siège du ventilateur.' }),
  P('toit-bag-arriere-2', 'toit', 'coller', /^Baguette dessus toit arrière 2$/),
  P('toit-iso', 'toit', 'isoler', /^Isolant toit/, { all: true, title: 'Isolation du toit', text: 'Isolant du toit, autour du compartiment de la caméra et du siège du ventilateur.' }),
  P('toit-dessus', 'toit', 'placer', /^Dessus toit$/, { text: 'À plat sur les baguettes, sans crénelage. Son ouverture carrée est au-dessus du compartiment de la caméra ; son encoche à l\'arrière laisse passer le siège du ventilateur.' }),
  P('toit-cadre', 'toit', 'coller', /^Cadre toit/, { text: "Coller les trois planches l'une sur l'autre. Elles descendent dans l'isolant entre les murs extérieur et intérieur et calent le toit. Dernière étape du toit : on les enfile sur la gaine (trou de Ø 18 mm) et on les colle sous le toit assemblé." }),

  // ---- f. Le reste : habillage, couvercle, baguettes de cale ----
  N('hab-poncage', 'habillage', 'peindre', "Poncer et arrondir les arêtes des lames", SAND_TEXT, [/^Lambris/]),
  N('hab-peinture', 'habillage', 'peindre', "Peindre l'habillage en blanc", PAINT_TEXT, [/^(Lambris|Plaque de ventilation)/]),
  N('hab-sechage', 'habillage', 'attendre', "Séchage de la peinture de l'habillage", PAINT_DRY, [/^(Lambris|Plaque de ventilation)/]),
  P('hab-curedents-tour', 'habillage', 'placer', /^Cure-dent habillage \d+$/, { all: true, text: "Système de positionnement : chaque lame est placée parfaitement (même hauteur, bon écartement) par deux cure-dents de 10 mm, sur tout le tour du nichoir, à la hauteur des deux du bas de la lame d'entrée. À planter AVANT de coller les lames, dans les trous de Ø 2,2 mm des parois du corps (un peu de colle) : 5 mm dépassent pour que chaque lame s'enfile dessus et se place exactement." }),
  P('hab-cotes', 'habillage', 'coller', /^Lambris (droite|gauche)/, { text: "Les lames des côtés se collent d'abord : la façade et l'arrière recouvrent leurs bouts." }),
  P('hab-avant', 'habillage', 'coller', /^Lambris avant \d+$/),
  P('hab-avant-perce', 'habillage', 'placer', /^Lambris avant \d+ \(percé\)(\.1)?$/, { title: "Lame du trou d'envol", text: "La lame du trou d'envol NE SE COLLE PAS : elle se retire pour accéder à l'entrée. Elle s'arrête sous la plaque de la caméra extérieure (pas d'habillage au-dessus de la plaque) et tient par quatre cure-dents : deux en bas, deux en haut, un peu descendus, dans la plaque avant du toit." }),
  P('hab-curedents', 'habillage', 'placer', /^Cure-dent lame d'entrée/, { all: true, text: "Quatre cure-dents enfoncés dans les quatre trous de Ø 2,2 mm de la lame, à travers la paroi derrière (un peu de colle sur les cure-dents du bas si besoin, jamais sur la lame), coupés à ras de la lame. Pour retirer la lame : les tirer ou les couper." }),
  P('hab-arriere', 'habillage', 'coller', /^Lambris arrière/),
  P('hab-ventilation', 'habillage', 'coller', /^Plaque de ventilation arrière/, { text: "S'emboîte dans l'ouverture de l'habillage arrière, jeu 0 : à gauche (vue de derrière) la grille de la sortie du ventilateur, à droite celle du Raspberry Pi. Elle tient par quatre cure-dents, un à chaque coin : percer ou repasser les quatre trous de Ø 2,2 mm à travers la plaque, puis la plaque arrière du toit (3 mm), enfoncer les cure-dents avec un peu de colle et les couper à ras." }),
  P('couv-crenelee', 'couvercle', 'placer', /^Toit en okoumé \(plaque crénelée\)/, { text: 'Toit en okoumé : deux plaques de 5 mm collées (10 mm), non peintes. Un grand trou oblong de 28 mm, le canal de la caméra 2, traverse cette plaque.' }),
  P('couv-bag-avant', 'couvercle', 'coller', /^Baguette couvercle avant$/, { text: 'Les dents de 5 mm entrent dans les fentes de la plaque crénelée et affleurent son dessus. Pas de dents devant le canal de la caméra 2.' }),
  P('couv-bag-arriere', 'couvercle', 'coller', /^Baguette couvercle arrière$/),
  P('couv-bag-cotes', 'couvercle', 'coller', /^Baguette couvercle (gauche|droite)$/),
  P('couv-pleine', 'couvercle', 'coller', /^Toit en okoumé \(plaque pleine\)/, { text: 'Collée à plat par-dessus : elle cache toutes les fentes et ferme le canal de la caméra 2, qui devient un conduit dans le toit.' }),
  N('couv-saturateur', 'couvercle', 'peindre', 'Saturer le toit en okoumé', SAT_TEXT, [LID_RE]),
  N('couv-sechage', 'couvercle', 'attendre', 'Séchage du saturateur du toit', SAT_DRY, [LID_RE]),
  P('bag-cale', 'baguettes', 'placer', /^Baguette de cale/, { all: true, title: 'Couper les baguettes de cale à la demande', text: 'Baguettes de contreplaqué de 3 mm, 5 mm de large, trois fois plus qu\'il n\'en faut : au montage, couper un morceau à la longueur voulue et le coller contre le composant (Pi, convertisseur, batterie, interrupteur du ventilateur), une fois celui-ci posé à sa place.' }),

  // ---- g. Électronique : Pi, essais sur l'établi ----

  // ---- g. Électronique : installation dans le nichoir ----
  P('elec-pi', 'elec', 'installer', /^Raspberry Pi/, { text: "Posé sur des entretoises de 6 mm dans le coin arrière gauche du toit, calé par des morceaux de baguette collés sur tous les côtés. Ses prises USB et Ethernet regardent la fenêtre de 60 × 24 mm de la plaque arrière ; son USB-C et ses micro-HDMI sont tournés vers le centre du toit." }),
  P('elec-camera', 'elec', 'installer', /^Caméra$/, { text: "À fleur du bois : la carte s'appuie contre la face intérieure, l'objectif traverse le trou de Ø 10 mm et affleure la face extérieure." }),
  P('elec-led-nid', 'elec', 'installer', /^LED infrarouges$/),
  P('elec-nappe', 'elec', 'cabler', /^Nappe caméra$/, { text: 'Nappe adaptatrice 22 → 15 broches : elle s\'enfiche dans le connecteur à levier du Pi, sans outil. Elle sort à l\'horizontale du connecteur de la caméra et passe au-dessus du siège du ventilateur.' }),
  P('elec-capteur', 'elec', 'installer', /^Capteur température/, { text: 'Incrusté à fleur dans le plafond, dans le compartiment de la caméra : la puce dans son logement de 9 × 9 mm, la carte contre la face intérieure.' }),
  P('elec-capteur-33', 'elec', 'cabler', /^Fil 3,3 V \(rouge\)$/),
  P('elec-capteur-sda', 'elec', 'cabler', /^Fil SDA/),
  P('elec-capteur-scl', 'elec', 'cabler', /^Fil SCL/),
  P('elec-capteur-masse', 'elec', 'cabler', /^Fil masse \(noir\)$/, { limit: 1 }),
  P('elec-sonde', 'elec', 'installer', /^Sonde de température extérieure/, { text: 'Dehors, sous le débord gauche du toit, contre le dessous du pan en okoumé, à l\'ombre.' }),
  P('elec-sonde-cable', 'elec', 'cabler', /^Câble sonde extérieure/, { text: 'Le câble passe par un trou rond de 5 mm dans la lame d\'habillage gauche et dans la plaque gauche du toit, sous la baguette du couvercle.' }),
  P('elec-sonde-module', 'elec', 'installer', /^Module DS18B20/, { text: 'Sur le dessus du toit, devant le Pi, contre le mur gauche : les trois fils de la sonde dans le bornier à vis du module (rouge 3,3 V, noir masse, jaune donnée).' }),
  P('elec-sonde-33', 'elec', 'cabler', /^Fil sonde 3,3 V/),
  P('elec-sonde-data', 'elec', 'cabler', /^Fil sonde DATA/),
  P('elec-sonde-masse', 'elec', 'cabler', /^Fil sonde masse/),
  P('elec-mosfet', 'elec', 'installer', /^Module 2 MOSFET/, { text: 'Il coupe la masse des deux cartes de LED infrarouges ; le 5 V reste direct sur les broches 2 et 4 du Pi.' }),
  P('elec-led-5v', 'elec', 'cabler', /^Fil 5 V \(rouge\)$/),
  P('elec-led-masse', 'elec', 'cabler', /^Fil masse \(noir\)$/, { limit: 1 }),
  P('elec-mosfet-masse', 'elec', 'cabler', /^Fil masse module LED/),
  P('elec-mosfet-in1', 'elec', 'cabler', /^Fil IN1/),
  P('elec-mosfet-in2', 'elec', 'cabler', /^Fil IN2/),
  P('elec-cam2', 'elec', 'installer', /^Caméra 2$/, { text: "Dehors, nue, sans boîte : caméra et carte de LED debout, tournées vers le trou d'envol (environ 50° vers le bas), accrochées sous le pan en okoumé." }),
  P('elec-led-ext', 'elec', 'installer', /^LED infrarouges extérieures/, { text: 'À 20 mm à gauche de la caméra, même orientation.' }),
  P('elec-nappe2', 'elec', 'cabler', /^Nappe caméra 2/, { text: 'La longue nappe monte dans le canal du toit (le grand trou oblong de la plaque crénelée) par son bout arrière, en ressort par son bout avant et pend jusqu\'à la caméra. Au-delà d\'environ 30 cm le signal peut devenir instable : à valider.' }),
  P('elec-led-ext-5v', 'elec', 'cabler', /^Fil 5 V LED extérieures/, { text: 'Les fils des LED suivent la nappe, à sa gauche, dans le même canal.' }),
  P('elec-led-ext-masse', 'elec', 'cabler', /^Fil masse LED extérieures/),
  P('elec-convertisseur', 'elec', 'installer', /^Convertisseur/, { text: 'Sortie USB-C directement dans le Pi : pas de câble à confectionner. Taille estimée dans le modèle, à confirmer avec le module acheté.' }),
  P('elec-wago-plus', 'elec', 'installer', /^Wago 221-413/, { text: 'Wago : lever le levier, glisser le fil dénudé de 11 mm, rabattre le levier. Aucune soudure.' }),
  P('elec-wago-moins', 'elec', 'installer', /^Wago 221-415/),
  P('elec-interrupteur', 'elec', 'installer', /^Module interrupteur 12 V ventilateur/, { text: 'Côté +12 V, près du Wago + : couper la masse ferait remonter 12 V dans les fils PWM et tachymètre, vers les GPIO du Pi (3,3 V seulement).' }),
  P('elec-rallonge', 'elec', 'installer', /^Rallonge ventilateur/, { text: 'Prise mâle collée sur la face avant du siège, contre son haut ; la prise femelle de la cassette s\'y emboîte à la verticale.' }),
  P('elec-fil-wago-interrupteur', 'elec', 'cabler', /^Fil Wago \+ → interrupteur/),
  P('elec-fil-interrupteur-ventilateur', 'elec', 'cabler', /^Fil interrupteur → ventilateur/),
  P('elec-fil-ventilateur-moins', 'elec', 'cabler', /^Fil ventilateur /),
  P('elec-fil-masse-interrupteur', 'elec', 'cabler', /^Fil masse interrupteur/),
  P('elec-fil-pwm', 'elec', 'cabler', /^Fil PWM ventilateur/),
  P('elec-fil-tacho', 'elec', 'cabler', /^Fil tachymètre ventilateur/),
  P('elec-fil-masse-commune', 'elec', 'cabler', /^Fil masse commune/),
  P('elec-fil-commande', 'elec', 'cabler', /^Fil commande interrupteur/),
  P('elec-fusible', 'elec', 'installer', /^Fusible/, { text: 'Porte-fusible à fils tout faits, collé contre le dessous du nichoir, dans le couloir entre la batterie et le mur droit, au plus près du + de la batterie : la lame A reçoit le + de la batterie et le + du régulateur, la lame B part vers le rail 12 V par la gaine.' }),
  P('elec-batterie', 'elec', 'installer', /^Batterie/, { text: 'Sous le nichoir, à plat, à l\'arrière gauche et tournée de 90°, tenue par les quatre étriers « Étrier batterie » : ses bornes + et − regardent l\'est, vers le régulateur. Le pack doit avoir un BMS qui coupe la charge sous 0 °C ; le lambris qui descend de 50 mm la protège du soleil direct.' }),
  P('elec-fil-fusible-batterie', 'elec', 'cabler', /^Fil fusible → batterie/),
  P('elec-fil-fusible-wago', 'elec', 'cabler', /^Fil fusible → Wago/, { text: 'Enfiler les deux fils qui montent (fusible → Wago + et batterie − → Wago −) dans la gaine de Ø 16 mm avant de brancher : elle porte deux fils de Ø 3,6 mm.' }),
  P('elec-fil-batterie-wago', 'elec', 'cabler', /^Fil batterie [^+]* → Wago/),
  P('elec-fil-rail-conv-plus', 'elec', 'cabler', /^Fil rail → convertisseur \+/),
  P('elec-fil-rail-conv-moins', 'elec', 'cabler', /^Fil rail → convertisseur [^+]/),
  P('elec-regulateur', 'elec', 'installer', /^Régulateur de charge/, { text: "Victron SmartSolar MPPT 75/10 (100 × 113 × 40 mm), à plat sous le nichoir à l'avant droit, tenu par les quatre étriers, bornes à vis sur la face est ; le lambris descend de 50 mm pour le protéger. Il chauffe de 2 à 5 W : ne pas le noyer dans l'isolant." }),
  P('elec-fil-reg-plus', 'elec', 'cabler', /^Fil régulateur → batterie \+/, { text: 'Fils courts sous le nichoir : le + va sur la lame A du fusible, le − sur la borne − de la batterie.' }),
  P('elec-fil-reg-moins', 'elec', 'cabler', /^Fil régulateur → batterie [^+]/),

  // ---- g. Électronique : essais avec la batterie, avant le panneau solaire ----
  N('essai-multimetre', 'essais', 'tester', 'Mesures au multimètre avant la mise sous tension', TEST_MULTIMETER),
  N('essai-batterie', 'essais', 'tester', 'Essai avec la batterie, le fusible et le régulateur', TEST_BATTERY),
  N(LID_BACK, 'essais', 'installer', 'Poser le toit en okoumé', "Il tient seul, posé sur le cadre et retenu par l'habillage collé au corps. Pour accéder de nouveau au grenier, on le soulève.", [LID_RE]),

  // ---- g. Panneau solaire, tout dernier ----
  P('sol-panneau', 'solaire', 'installer', /^Panneau solaire/, { text: 'Déporté à environ 70 cm à droite du nichoir, incliné de 35° vers l\'avant, son bord bas près du sol.' }),
  P('sol-cable', 'solaire', 'cabler', /^Câble 12 V vers le toit/, { text: [
    'Il part de la boîte de jonction au dos du panneau, longe le sol, remonte contre l\'habillage et passe sous l\'habillage, sans le percer, jusqu\'au régulateur sous le nichoir. Le panneau se branche en dernier, une fois les essais validés.',
    "Ensuite, suivre le niveau de la batterie sur la page du Pi : la stratégie d'énergie prévoit de mesurer plusieurs jours avant de décider de passer de 6 Ah à 12 Ah.",
  ].join('\n') }),
];
