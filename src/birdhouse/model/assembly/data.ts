import type { AssemblyBlock, AssemblyKind } from './types';
import { BENCH_CAMERAS, BENCH_FAN, BENCH_PAGE, BENCH_SENSORS, DRY_TEXT, OIL_FULL, OIL_SHORT, PI_PROGRAM, PI_SD, TEST_BATTERY, TEST_MULTIMETER } from './texts';

/** Blocs du montage, dans l'ordre. */
export const ASSEMBLY_BLOCKS: AssemblyBlock[] = [
  { id: 'aeration', title: 'Aération du corps' },
  { id: 'hiver', title: "Pièces d'hiver" },
  { id: 'corps', title: 'Corps' },
  { id: 'entree', title: 'Entrée' },
  { id: 'toit', title: 'Toit' },
  { id: 'habillage', title: 'Habillage' },
  { id: 'couvercle', title: 'Couvercle' },
  { id: 'baguettes', title: 'Baguettes de cale' },
  { id: 'banc', title: "Électronique : Pi et essais sur l'établi" },
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

export const SEQ: Rule[] = [
  // ---- a. Aération du corps : le module (conduit de la prise d'air basse), monté en sous-ensemble ----
  N('aer-huile', 'aeration', 'huiler', "Huiler le conduit d'air", [
    "Le conduit d'air est en zone mouillée en permanence : huile de lin, puis vernis ou lasure à l'eau (étiquette jouets EN 71-3).",
    OIL_FULL,
  ].join('\n'), [/^Conduit d'air/]),
  N('aer-sechage', 'aeration', 'attendre', 'Séchage du conduit d\'air', DRY_TEXT, [/^Conduit d'air/]),
  P('aer-2', 'aeration', 'placer', /^Conduit d'air 2$/, { text: (r) => `Côté nid : sa fente de 34 × 30 mm se place en face de la grille de ${r(/^Côté gauche int$/)}.` }),
  P('aer-34', 'aeration', 'emboiter', /^Conduit d'air [34]$/),
  P('aer-1', 'aeration', 'emboiter', /^Conduit d'air 1$/),
  P('aer-5', 'aeration', 'emboiter', /^Conduit d'air 5/),

  // ---- b. Pièces d'hiver (rechange) ----
  N('hiv-huile', 'hiver', 'huiler', "Huiler les pièces d'hiver", `${OIL_SHORT}\nLes parois de la sous-boîte passent pile (jeu 0) dans le conduit d'air : couche très fine, bien essuyée.`, [/^(Bloc isolant d'hiver|Poignée bloc d'hiver|Bouchon-boîte|Poignée bouchon)/]),
  N('hiv-sechage', 'hiver', 'attendre', "Séchage des pièces d'hiver", DRY_TEXT, [/^(Bloc isolant d'hiver|Poignée bloc d'hiver|Bouchon-boîte|Poignée bouchon)/]),
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

  // ---- c. Corps ----
  N('corps-huile', 'corps', 'huiler', 'Huiler les pièces du corps', (r) => [
    OIL_SHORT,
    `Huiler les parois extérieures, le dessous, les étriers, les nervures et les clavettes. Ne jamais huiler ${r(/^Plancher int$/)} ni les quatre parois intérieures (le nid reste brut, poncé, sans suie de découpe).`,
    `Le dessous du nichoir (${r(/^Dessous ext$/)}) est en zone mouillée en permanence : huile, plus vernis ou lasure à l'eau (étiquette jouets EN 71-3).`,
  ].join('\n'), [/^(Dessous ext|Face (avant|arrière) ext|Côté (droit|gauche) ext|Étrier régulateur|Fixation arbre|Clavette fixation)/]),
  N('corps-sechage', 'corps', 'attendre', 'Séchage des pièces du corps', DRY_TEXT, [/^(Dessous ext|Face (avant|arrière) ext|Côté (droit|gauche) ext|Étrier régulateur|Fixation arbre|Clavette fixation)/]),
  P('corps-dessous', 'corps', 'placer', /^Dessous ext$/, { text: "À plat. Son ouverture rectangulaire laisse passer plus tard le module d'aération." }),
  P('corps-etriers', 'corps', 'coller', /^Étrier régulateur/, { text: 'Les tenons des bras traversent le fond par des fentes de 8 × 3 mm et affleurent son dessus : ils tiendront le régulateur sous le nichoir.' }),
  P('corps-avant-ext', 'corps', 'emboiter', /^Face avant ext$/, { text: (r) => `Ne pas monter ${r(/^Côté gauche ext$/)} maintenant : c'est la dernière paroi du corps, après le module d'aération et l'isolation.` }),
  P('corps-arriere-ext', 'corps', 'emboiter', /^Face arrière ext$/),
  P('corps-droit-ext', 'corps', 'emboiter', /^Côté droit ext$/),
  P('corps-nervures', 'corps', 'coller', /^Fixation arbre/, { text: 'Chaque nervure est faite de trois plaques collées face à face. Les dents traversent les fentes du mur arrière extérieur et ressortent de 6 mm dans l\'isolant, avec un trou de 3 × 20 mm pour la clavette. Soigner le collage.' }),
  P('corps-clavettes', 'corps', 'coller', /^Clavette fixation/, { text: 'Chaque clavette traverse les trois plaques de sa nervure par le trou de 3 × 20 mm et les verrouille contre la face intérieure du mur, sans espace.' }),
  P('corps-iso-bas', 'corps', 'isoler', /^Isolant sous le plancher/, { text: "L'isolation du bas se met AVANT le module d'aération : il la traverse." }),
  P('corps-plancher', 'corps', 'emboiter', /^Plancher int$/, { text: "Ses dents traversent les fentes des murs extérieurs. Il n'a que le passage du conduit d'air." }),
  P('corps-avant-int', 'corps', 'emboiter', /^Face avant int$/),
  P('corps-arriere-int', 'corps', 'emboiter', /^Face arrière int$/),
  P('corps-droit-int', 'corps', 'emboiter', /^Côté droit int$/),
  P('corps-gauche-int', 'corps', 'emboiter', /^Côté gauche int$/, { text: "Sa grille (six fentes de 4 mm) est tournée vers le nid. Le module d'aération se colle contre sa face extérieure." }),
  P('corps-gaine', 'corps', 'installer', /^Gaine des fils/, { text: [
    "À passer maintenant, pendant que tout est accessible. Elle monte dans le coin arrière droit, à 1 cm du mur arrière, et traverse des trous de Ø 16 mm, serrés : le fond, le plancher intérieur, puis plus tard les trois planches du cadre du toit, le dessous et le dessus du toit.",
    "L'isolant n'est pas découpé autour : on pousse la gaine dans la laine.",
  ].join('\n') }),
  N('corps-module-air', 'corps', 'installer', "Installer le module d'aération", (r) => [
    `Le monter AVANT de fixer ${r(/^Côté gauche ext$/)}, et après l'isolation du bas.`,
    "- Il traverse l'ouverture de « Dessous ext » et l'isolation du bas, passe par le passage du plancher intérieur.",
    `- Il se colle contre la face extérieure de ${r(/^Côté gauche int$/)}, sa fente de 34 × 30 mm en face de la grille.`,
    'Le côté gauche est encore ouvert : on y accède.',
  ].join('\n'), [/^Conduit d'air/]),
  P('corps-iso-gauche', 'corps', 'isoler', /^Isolant gauche \d/, { text: "L'isolant du mur gauche se met APRÈS le module d'aération et AVANT la paroi extérieure gauche." }),
  P('corps-iso-gauche-conduit', 'corps', 'isoler', /^Isolant gauche dessus conduit/),
  P('corps-iso-droite', 'corps', 'isoler', /^Isolant droite$/),
  P('corps-iso-arriere', 'corps', 'isoler', /^Isolant arrière$/),
  P('corps-gauche-ext', 'corps', 'emboiter', /^Côté gauche ext$/, { text: "Dernière paroi du corps : le module d'aération et l'isolation sont en place." }),

  // ---- d. Entrée et isolant restant ----
  N('ent-huile', 'entree', 'huiler', "Huiler le bloc d'entrée", `${OIL_SHORT}\nLe côté nid du bloc et la face intérieure du tunnel (le trou) restent bruts.`, [/^Entrée \d+$/]),
  N('ent-sechage', 'entree', 'attendre', "Séchage du bloc d'entrée", DRY_TEXT, [/^Entrée \d+$/]),
  P('ent-iso-sous', 'entree', 'isoler', /^Isolant sous le bloc d'entrée/),
  P('ent-iso-avant-g', 'entree', 'isoler', /^Isolant avant gauche/),
  P('ent-iso-avant-d', 'entree', 'isoler', /^Isolant avant droite/),
  P('ent-bloc', 'entree', 'placer', /^Entrée \d+$/, { all: true, title: "Empiler le bloc d'entrée", text: (r) => [
    `Empiler les carrés percés dans l'ordre, du dehors vers le nid (${r(/^Entrée 1$/)} affleure le mur extérieur, le dernier affleure la face intérieure) : rien ne dépasse.`,
    "Le bloc coulisse de haut en bas dans l'encoche des deux faces avant, toit retiré.",
  ].join('\n') }),

  // ---- e. Toit ----
  N('toit-huile', 'toit', 'huiler', 'Huiler les pièces du toit', `${OIL_SHORT}\nCadres, plaques, baguettes, siège et cassette du ventilateur.`, [/^(Cadre toit|Dessous toit|Dessus toit|(Face|Côté) \S+ toit|(Face|Côté) \S+ caméra 1|Baguette dessus toit|Goulotte ventilateur|Cassette ventilateur|Conduit de sortie|Poignée cassette)/]),
  N('toit-sechage', 'toit', 'attendre', 'Séchage des pièces du toit', DRY_TEXT, [/^(Cadre toit|Dessous toit|Dessus toit|(Face|Côté) \S+ toit|(Face|Côté) \S+ caméra 1|Baguette dessus toit|Goulotte ventilateur|Cassette ventilateur|Conduit de sortie|Poignée cassette)/]),
  P('toit-cadre', 'toit', 'coller', /^Cadre toit/, { text: 'Coller les trois planches l\'une sur l\'autre. Elles descendent dans l\'isolant entre les murs extérieur et intérieur et calent le toit. Les enfiler sur la gaine (trou de Ø 16 mm).' }),
  P('toit-dessous', 'toit', 'placer', /^Dessous toit$/),
  P('toit-avant', 'toit', 'emboiter', /^Face avant toit$/),
  P('toit-arriere', 'toit', 'emboiter', /^Face arrière toit$/),
  P('toit-droit', 'toit', 'emboiter', /^Côté droit toit$/),
  P('toit-gauche', 'toit', 'emboiter', /^Côté gauche toit$/),
  P('toit-cam-av-ar', 'toit', 'emboiter', /^Face (avant|arrière) caméra 1$/, { text: 'Compartiment de la caméra : les dents de ses murs traversent les fentes du plancher du toit.' }),
  P('toit-cam-cotes', 'toit', 'emboiter', /^Côté (droit|gauche) caméra 1$/),
  P('toit-siege-cotes', 'toit', 'emboiter', /^Goulotte ventilateur (gauche|droite)$/, { text: 'Siège du ventilateur : ses dents traversent le plancher du toit ; la plaque arrière du toit fait la quatrième paroi.' }),
  P('toit-siege-avant', 'toit', 'emboiter', /^Goulotte ventilateur avant$/),
  P('toit-bag-cotes', 'toit', 'coller', /^Baguette dessus toit (gauche|droite)$/, { text: 'Les baguettes se posent à plat contre la face intérieure des plaques du toit, dents dans les fentes : elles portent « Dessus toit ».' }),
  P('toit-bag-avant', 'toit', 'coller', /^Baguette dessus toit avant$/),
  P('toit-bag-arriere-1', 'toit', 'coller', /^Baguette dessus toit arrière 1$/, { text: 'La baguette arrière est en deux morceaux : elle contourne le siège du ventilateur.' }),
  P('toit-bag-arriere-2', 'toit', 'coller', /^Baguette dessus toit arrière 2$/),
  P('toit-iso', 'toit', 'isoler', /^Isolant toit/, { text: 'Isolant du toit, autour du compartiment de la caméra et du siège du ventilateur.' }),
  P('toit-dessus', 'toit', 'placer', /^Dessus toit$/, { text: 'À plat sur les baguettes, sans crénelage. Son ouverture carrée est au-dessus du compartiment de la caméra ; son encoche à l\'arrière laisse passer le siège du ventilateur.' }),
  P('cass-cadre', 'toit', 'placer', /^Cassette ventilateur cadre du bas/, { text: 'Cassette du ventilateur : amovible à la main, sans outil ni vis. Quatre parois emboîtées par leurs arêtes verticales ; le cadre du bas et le couvercle s\'emboîtent dans les parois.' }),
  P('cass-parois-1', 'toit', 'emboiter', /^Cassette ventilateur 1$/),
  P('cass-parois-2', 'toit', 'emboiter', /^Cassette ventilateur 2$/),
  P('cass-parois-34', 'toit', 'emboiter', /^Cassette ventilateur [34]$/),
  P('cass-grille', 'toit', 'placer', /^Grille de protection ventilateur/, { text: 'Sur le cadre du bas, entre le cadre et le ventilateur : elle sort avec la cassette.' }),
  P('cass-plots', 'toit', 'placer', /^Plot caoutchouc ventilateur/, { all: true, text: 'Quatre plots en caoutchouc de 12 × 2 × 3 mm posés sur le cadre : les vibrations ne passent que par eux.' }),
  P('cass-ventilateur', 'toit', 'placer', /^Ventilateur Noctua/),
  P('cass-couvercle', 'toit', 'emboiter', /^Cassette ventilateur couvercle/),
  P('cass-poignee', 'toit', 'coller', /^Poignée cassette/, { text: 'U de contreplaqué : trois couches de 3 mm collées face à face (9 mm), pieds dans deux fentes du couvercle.' }),
  P('cass-prise', 'toit', 'placer', /^Prise 4 broches du ventilateur/, { text: "Le câble d'origine du ventilateur monte dans la cassette, traverse le couvercle par un passage de 12 × 6 mm et finit par cette prise femelle, collée sur la tranche avant du couvercle." }),
  P('cass-fils', 'toit', 'cabler', /^Fil cassette/),
  P('cass-sortie-12', 'toit', 'emboiter', /^Conduit de sortie [12]$/, { text: 'Conduit de sortie : ses dents entrent dans les fentes de la paroi arrière de la cassette, contre la fenêtre. Il sort et rentre avec elle.' }),
  P('cass-sortie-34', 'toit', 'emboiter', /^Conduit de sortie [34]$/),
  N('cass-pose', 'toit', 'installer', 'Poser la cassette dans le siège', 'La cassette se pose par gravité, ajustée pile au siège (sans joint) ; on la retire à la main par le haut, après avoir débranché la prise 4 broches.', [/^Cassette ventilateur/]),

  // ---- f. Le reste : habillage, couvercle, baguettes de cale ----
  N('hab-peinture', 'habillage', 'peindre', "Peindre l'habillage en blanc", "L'habillage en okoumé est peint en blanc, pas huilé : la peinture ne tient pas sur une surface huilée.", [/^Lambris/]),
  N('hab-sechage', 'habillage', 'attendre', "Séchage de la peinture de l'habillage", "Laisser sécher la peinture avant de coller les lames.", [/^Lambris/]),
  P('hab-cotes', 'habillage', 'coller', /^Lambris (droite|gauche)/, { text: "Les lames des côtés se collent d'abord : la façade et l'arrière recouvrent leurs bouts." }),
  P('hab-avant', 'habillage', 'coller', /^Lambris avant/),
  P('hab-arriere', 'habillage', 'coller', /^Lambris arrière/),
  P('couv-crenelee', 'couvercle', 'placer', /^Toit en okoumé \(plaque crénelée\)/, { text: 'Toit en okoumé : deux plaques de 5 mm collées (10 mm), non peintes. Un grand trou oblong de 28 mm, le canal de la caméra 2, traverse cette plaque.' }),
  P('couv-bag-avant', 'couvercle', 'coller', /^Baguette couvercle avant$/, { text: 'Les dents de 5 mm entrent dans les fentes de la plaque crénelée et affleurent son dessus. Pas de dents devant le canal de la caméra 2.' }),
  P('couv-bag-arriere', 'couvercle', 'coller', /^Baguette couvercle arrière$/),
  P('couv-bag-cotes', 'couvercle', 'coller', /^Baguette couvercle (gauche|droite)$/),
  P('couv-pleine', 'couvercle', 'coller', /^Toit en okoumé \(plaque pleine\)/, { text: 'Collée à plat par-dessus : elle cache toutes les fentes et ferme le canal de la caméra 2, qui devient un conduit dans le toit.' }),
  N('couv-huile', 'couvercle', 'huiler', 'Huiler le toit en okoumé', `${OIL_SHORT}\nLe toit est exposé à la pluie : huile de lin cuite, 2 couches, sur l'ensemble (faces, chants, dessous), avant la pose.`, [LID_RE]),
  N('couv-sechage', 'couvercle', 'attendre', 'Séchage du toit en okoumé', DRY_TEXT, [LID_RE]),
  P('bag-cale', 'baguettes', 'placer', /^Baguette de cale/, { all: true, title: 'Couper les baguettes de cale à la demande', text: 'Baguettes de contreplaqué de 3 mm, 5 mm de large, trois fois plus qu\'il n\'en faut : au montage, couper un morceau à la longueur voulue et le coller contre le composant (Pi, convertisseur, batterie, interrupteur du ventilateur), une fois celui-ci posé à sa place.' }),

  // ---- g. Électronique : Pi, essais sur l'établi ----
  N('pi-sd', 'banc', 'installer', 'Préparer la carte microSD du Pi', PI_SD),
  N('pi-programme', 'banc', 'installer', 'Installer le programme du nichoir sur le Pi', PI_PROGRAM),
  N('banc-capteurs', 'banc', 'tester', "Essai sur l'établi : capteur du nid et sonde de dehors", BENCH_SENSORS),
  N('banc-cameras', 'banc', 'tester', "Essai sur l'établi : caméras et LED infrarouges", BENCH_CAMERAS),
  N('banc-ventilateur', 'banc', 'tester', "Essai sur l'établi : ventilateur et PWM", BENCH_FAN),
  N('banc-page', 'banc', 'tester', "Essai sur l'établi : page web", BENCH_PAGE),

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
  P('elec-fusible', 'elec', 'installer', /^Fusible/, { text: 'Porte-fusible à fils tout faits, en série sur le fil + de la batterie, au plus près d\'elle.' }),
  P('elec-batterie', 'elec', 'installer', /^Batterie/, { text: 'Dans le grenier, à plat sur le dessus du toit, dans le coin avant droit, à 1 cm des murs, calée par des morceaux de baguette collés tout autour. Le pack doit avoir un BMS.' }),
  P('elec-fil-fusible-batterie', 'elec', 'cabler', /^Fil fusible → batterie/),
  P('elec-fil-fusible-wago', 'elec', 'cabler', /^Fil fusible → Wago/),
  P('elec-fil-batterie-wago', 'elec', 'cabler', /^Fil batterie [^+]* → Wago/),
  P('elec-fil-rail-conv-plus', 'elec', 'cabler', /^Fil rail → convertisseur \+/),
  P('elec-fil-rail-conv-moins', 'elec', 'cabler', /^Fil rail → convertisseur [^+]/),
  P('elec-regulateur', 'elec', 'installer', /^Régulateur de charge/, { text: "À plat sous le nichoir, tenu par les quatre étriers ; le lambris descend de 45 mm pour le protéger. Il chauffe de 2 à 5 W : ne pas le noyer dans l'isolant." }),
  P('elec-fil-reg-plus', 'elec', 'cabler', /^Fil régulateur → batterie \+/, { text: 'Enfiler les deux fils (+ et −) dans la gaine de Ø 16 mm avant de brancher.' }),
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
