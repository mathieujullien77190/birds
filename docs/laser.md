# Pilotage de la laser (Sculpfun E1 Pro 21 W)

> Le logiciel de pilotage est un **projet autonome** : le dossier `laser-control/` (son `README.md` décrit l'installation, l'export et le format `LaserJob`). Il tourne seul (`npm install && npm run dev`, SVG ou G-code déposé sur la page) et l'app du nichoir l'utilise via l'alias `@laser` ; le mode d'emploi ci-dessous est le même dans les deux.

L'app pilote la découpeuse directement depuis le navigateur (API **Web Serial**) : connexion USB, déplacements, cadre à vide, envoi du G-code planche par planche. Panneau de gauche, bloc « Pilotage laser (Sculpfun) » (sous « Découpe laser ») → « Ouvrir l'application ». Au-dessus de la vue, en bas à droite, une bascule « 3D / Planches » affiche les planches à découper à la place de la 3D.

## Matériel et branchement
| Élément | Valeur |
|---|---|
| Machine | Sculpfun E1 Pro 21 W (la seule machine prise en charge), caisson fermé classe 1, diode bleue de 21 W (455 nm), assistance d'air fournie ; la variante Dual ajoute un module infrarouge 3 W (1064 nm), non piloté par l'app ; prix relevé sur fr.sculpfun.com le 19/10/2026 : 799 € (21 W) et 1 049 € (Dual), expédition annoncée mi-juillet sur la fiche (à revérifier) |
| Contrôleur | GRBL 1.1, USB série 115200 bauds 8N1 (carte STM32 + ESP32, GRBL personnalisé ; réglages relevés sur diode-laser-wiki.com : `$30=1000`, `$32=1`, `$110/$111=36000`, `$130=400`, `$131=320`, à confirmer par `$$` ; butées matérielles actives `$21=1`, limites logicielles `$20=0` ; `$s` liste les réglages propres à la machine) |
| Zone | 400 × 320 mm (zone de gravure ; le matériau posé peut faire 450 × 350 mm, épaisseur 30 mm sur le nid d'abeille) ; la planche par défaut de l'app est de 400 × 320 mm : le contreplaqué du commerce de 400 × 400 mm doit être recoupé à 400 × 320 (ou 400 × 350 au plus), réglable par les curseurs de « Découpe laser » |
| Navigateur | Chrome ou Edge, page en HTTPS ou sur `localhost` (Firefox et Safari : pas de Web Serial) |

1. Brancher le câble USB, allumer la machine.
2. Windows : si aucun port n'apparaît, installer le pilote **CH340** (puce USB de la carte).
3. Fermer tout autre logiciel connecté au port (LaserGRBL, LightBurn, autre onglet).
4. « Connecter la laser » : le navigateur demande de choisir le port (clic obligatoire).

## La machine : Sculpfun E1 Pro 21 W
Fiche du vendeur : caisson fermé classe 1, diode bleue de 21 W (455 nm, spot 0,06 × 0,08 mm), zone de gravure 400 × 320 mm, CoreXY jusqu à 600 mm/s, caméra intégrée, pompe d assistance d air fournie, alimentation 24 V 6 A, USB ou WiFi (via application), logiciels Sculpfun Space, LightBurn et LaserGRBL. **À confirmer à la réception** : la version de GRBL (`$I`) et le 115200 bauds en USB ; le guide de démarrage du constructeur ne cite que LightBurn. La case **« Assistance d'air (M8 / M9) »** des réglages de coupe est cochée par défaut : le programme envoie `M8` avant la coupe et `M9` après. Le Web Serial réel reste non testé faute de machine. Manuel E1 V1.0 : pilote CH340 ; la machine ne tire pas couvercle ouvert ; après une ouverture, un clic sur le bouton E1 libère le verrou de sécurité ; double-clic = retour à l'origine machine ; avec la « Safety Positioning », ouvrir le couvercle envoie la tête au coin haut-gauche puis elle revient à sa position ; la caméra se branche au PC par un câble USB-A vers USB-A (fourni) sur son propre port, sans passer par le port de la carte, et doit être calibrée dans le logiciel ; l'éclairage intérieur se règle par la commande `$light/duty=0..1000` (la syntaxe `$nom/valeur` fait penser à un contrôleur de type ESP32, à confirmer par `$I`).

## Caméra
Le bloc « Caméra de la machine » (colonne de droite) affiche l'image de la caméra intégrée, reconnue comme une webcam USB (câble USB-A vers USB-A sur son port « Camera »). Il sert à regarder la planche et le cadre à vide. **Vue plate** : on tire les 4 coins numérotés sur un rectangle de taille connue (la planche, le plateau), on règle « Correction de l'objectif » (distorsion radiale, la valeur négative corrige un effet de tonneau) jusqu'à ce que les lignes droites le soient, on saisit la taille du rectangle, puis « Vue plate » redresse l'image en vue de dessus (grille de 50 mm en option pour vérifier) ; le réglage est gardé dans le navigateur (`laser-camera`). Précision indicative seulement : le positionnement précis par caméra reste dans Sculpfun Space ou LightBurn. Autoriser la caméra dans le navigateur, fermer les autres logiciels qui l'utilisent. La luminosité de l'éclairage intérieur se règle depuis la console de l'app par `$light/duty=0..1000`.

## Réglages relevés de la machine (`$s`, diode-laser-wiki.com)
Mode laser actif, S max 1000, homing actif (X puis Y, retrait 1,5 mm), butées matérielles actives, erreurs en `error:NN` (`$Errors/Verbose Off`). Autres : pompe d'air gérée par la carte (`$AirPump/Enable On`, 50 % en marche, 5 % au repos ; l'effet de `M8` n'est pas documenté, décocher « Assistance d'air » si la carte le refuse), alerte incendie (`$FireAlert/Enable On`), ventilateur d'extraction qui continue après la coupe (`$Fan/VentingTime 120`), éclairage intérieur (`$Light/Duty 500`), compensation de puissance du laser bleu (`$BlueLaser/PowerComp/Enable On`), buzzer. À comparer avec la sortie réelle de `$s` à la réception.

## Mise en place d'une découpe
0. Arrêt d'urgence relevé, clé USB de sécurité insérée, couvercle fermé. La E1 Pro a le homing actif (`$22 = 1`, vu sur diode-laser-wiki.com) : si l'app affiche une alarme à la connexion, « Référencer ($H) » (ou un double-clic sur le bouton E1) envoie la tête sur ses butées ; si `$H` répond `error:5`, le homing est désactivé et « Déverrouiller ($X) » suffit. Après un `$X`, refaire l'origine.
Premier homing : près de l'arrêt d'urgence, couvercle fermé ; si les moteurs forcent contre un bord (bruit), couper l'alimentation tout de suite et vérifier que rien ne gêne la tête ni les butées (un module laser relevé trop haut peut empêcher une butée de se déclencher, cas relevé sur une S30 Pro Max).
1. Connexion ; vérifier `$32 = 1` (mode laser). Sinon l'app avertit, verrouille la découpe et propose `$32=1` après confirmation.
2. Poser et fixer la planche, régler la focale.
3. Avec les flèches, amener la tête sur le **coin bas-gauche** du matériau, puis « Origine ici » (`G10 L20 P1 X0 Y0`).
4. « Tracer le cadre à vide » : la tête suit le rectangle des pièces, **laser éteint** (`M5` et déplacements `$J=`, qui ne peuvent pas allumer le laser).
5. Régler vitesse, puissance, passes ; **lancer d'abord la planche d'essai**.
6. Vérifier l'aperçu (coupes rouges, déplacements rapides en pointillés gris), puis « Lancer la découpe… », cocher la liste de sécurité.

## Convention d'axes
Origine de travail = coin **bas-gauche** de la planche vue de dessus, X vers la droite, Y vers l'**arrière** de la machine. Le SVG de l'app a y vers le bas : `Y_machine = H − y_svg`. Unités en mm, `G21 G90`, système G54.

## G-code produit
`G21 G90 G54 G94`, `M5`, (`M8` : assistance d'air, cochée par défaut), `M4 S0` (mode laser dynamique), puis pour chaque contour un `G0` (laser éteint) et des `G1` avec `F` (vitesse) et `S` (puissance = % × `$30` / 100, jamais au-dessus du plafond ni de `$30`), enfin `M5`, (`M9`), retour `G0 X0 Y0`, `M5`. Les pièces sont coupées des plus petites aux plus grandes, **trous avant le contour extérieur** de chaque pièce. Passes : toute la planche puis on recommence, ou contour par contour. **Le code de chaque plaque (en bleu dans les SVG) est gravé avant la coupe, à bas régime ; les noms des pièces ne sont pas gravés** (voir « Numérotation et gravure des plaques »).

## Numérotation et gravure des plaques
Chaque plaque découpée au laser porte un **code** pour la retrouver au montage : la première lettre du groupe (Toit → **T**, Habillage → **H**, Ventilation → **V**, Aération du corps → **A**…) puis un numéro à deux chiffres (**T-01**, **T-02**…, un tiret entre la catégorie et le numéro pour la lisibilité). **Des pièces strictement identiques** (même matériau et épaisseur, mêmes dimensions, même contour, mêmes trous et mêmes crans) **portent le même numéro** ; une pièce en miroir d'une autre n'est pas identique. Quand deux groupes commencent par la même lettre, ils prennent le plus court préfixe qui les distingue (Électronique / Entrée → **EL-01** / **EN-01**, Corps / Couvercle → **COR-01** / **COU-01**). Les numéros suivent l'ordre d'apparition des plaques dans la scène ; le code se recalcule tout seul quand une pièce change (`src/birdhouse/model/sheets/partCodes.ts`).

- **Dans « Pièces »** : une petite pastille bleue avec le code précède le nom de chaque plaque découpée.
- **Dans la 3D** : le bouton **N°** de la barre du haut écrit le code sur la face +z de chaque plaque (la face qui reste vers le haut sur la planche de découpe) ; il se retient d'une visite à l'autre.
- **Sur la planche** : le code est **gravé en bleu**, en petits rectangles fermés de 0,8 mm (police à segments avec tiret, 5,6 mm de haut, trait de 0,8 mm), à bas régime et **avant** la coupe, à un endroit libre de la plaque : au moins 1,2 mm de matière autour (ni bord, ni dent, ni trou), orienté comme la pièce posée sur la planche. `laser-control` n'a pas changé : il grave déjà les contours bleus fermés. Le nom de la pièce reste écrit en bleu dans le SVG (texte, jamais gravé).
- **Plaques trop petites** : si 3,4 mm de texte (4,5 puis 5,6 mm si la place le permet) avec 1,2 mm de marge ne tiennent nulle part, la plaque a son code dans la liste mais **rien n'est gravé** (les poignées de la cassette et du bouchon) : on la reconnaît à sa forme.

### Plaques à découper (nichoir par défaut)
Liste générée à partir du modèle (`partTable`) ; l'ordre est celui de la scène. La quantité compte aussi les **pièces fines de rechange** (3 exemplaires de chaque plaque fine, groupe « Pièces fines de rechange », même numéro que l'original ; seuil : plus petit côté ou largeur moyenne ≤ 12 mm).

| Code | Pièce(s) | Groupe | Matériau | Quantité |
| --- | --- | --- | --- | --- |
| H-01 | Lambris droite 1, Lambris gauche 1 | Habillage | okoumé | 2 |
| H-02 | Lambris droite 2, Lambris gauche 2 | Habillage | okoumé | 2 |
| H-03 | Lambris droite 3, Lambris gauche 3 | Habillage | okoumé | 2 |
| H-04 | Lambris droite 4, Lambris gauche 4 | Habillage | okoumé | 2 |
| H-05 | Lambris droite 5, Lambris gauche 5 | Habillage | okoumé | 2 |
| H-06 | Lambris avant 1 | Habillage | okoumé | 1 |
| H-07 | Lambris arrière 1 | Habillage | okoumé | 1 |
| H-08 | Lambris avant 2, Lambris avant 4 | Habillage | okoumé | 2 |
| H-09 | Lambris arrière 2.1 | Habillage | okoumé | 1 |
| H-10 | Lambris arrière 2.2, Lambris arrière 3.2 | Habillage | okoumé | 2 |
| H-11 | Lambris avant 3 (percé) | Habillage | okoumé | 1 |
| H-12 | Lambris arrière 3.1 | Habillage | okoumé | 1 |
| H-13 | Lambris arrière 4 | Habillage | okoumé | 1 |
| H-14 | Lambris avant 5 | Habillage | okoumé | 1 |
| H-15 | Lambris arrière 5 | Habillage | okoumé | 1 |
| H-16 | Plaque de ventilation arrière | Habillage | okoumé | 1 |
| COU-01 | Baguette couvercle avant | Couvercle | contreplaqué | 4 |
| COU-02 | Baguette couvercle arrière | Couvercle | contreplaqué | 4 |
| COU-03 | Baguette couvercle gauche | Couvercle | contreplaqué | 4 |
| COU-04 | Baguette couvercle droite | Couvercle | contreplaqué | 4 |
| COU-05 | Toit en okoumé (plaque crénelée) | Couvercle | okoumé | 1 |
| COU-06 | Toit en okoumé (plaque pleine) | Couvercle | okoumé | 1 |
| COR-01 | Fixation arbre 1.1, Fixation arbre 1.2… (6 noms) | Corps | contreplaqué | 6 |
| COR-02 | Clavette fixation 1.1, Clavette fixation 1.2… (4 noms) | Corps | contreplaqué | 16 |
| V-01 | Cassette ventilateur 1 | Ventilation | contreplaqué | 1 |
| V-02 | Cassette ventilateur 2 | Ventilation | contreplaqué | 1 |
| V-03 | Cassette ventilateur 4, Cassette ventilateur 3 | Ventilation | contreplaqué | 2 |
| V-04 | Cassette ventilateur couvercle | Ventilation | contreplaqué | 1 |
| V-05 | Cassette ventilateur cadre du bas | Ventilation | contreplaqué | 1 |
| V-06 | Poignée cassette 1, Poignée cassette 2, Poignée cassette 3 | Ventilation | contreplaqué | 12 |
| P-01 | Bloc isolant d'hiver 1, Bloc isolant d'hiver 2 | Pièces d'hiver (rechange) | contreplaqué | 2 |
| P-02 | Bloc isolant d'hiver 3, Bloc isolant d'hiver 4 | Pièces d'hiver (rechange) | contreplaqué | 2 |
| P-03 | Bloc isolant d'hiver couvercle | Pièces d'hiver (rechange) | contreplaqué | 1 |
| P-04 | Bloc isolant d'hiver fond | Pièces d'hiver (rechange) | contreplaqué | 1 |
| P-05 | Poignée bloc d'hiver 1, Poignée bloc d'hiver 2, Poignée bloc d'hiver 3 | Pièces d'hiver (rechange) | contreplaqué | 12 |
| T-01 | Goulotte ventilateur gauche, Goulotte ventilateur droite | Toit | contreplaqué | 2 |
| T-02 | Goulotte ventilateur avant | Toit | contreplaqué | 1 |
| V-07 | Conduit de sortie 1, Conduit de sortie 2 | Ventilation | contreplaqué | 8 |
| V-08 | Conduit de sortie 3, Conduit de sortie 4 | Ventilation | contreplaqué | 8 |
| A-01 | Conduit d'air 3, Conduit d'air 4 | Aération du corps | contreplaqué | 2 |
| A-02 | Conduit d'air 2 | Aération du corps | contreplaqué | 1 |
| A-03 | Conduit d'air 1 | Aération du corps | contreplaqué | 1 |
| A-04 | Conduit d'air 5 (couvercle) | Aération du corps | contreplaqué | 1 |
| P-06 | Bouchon-boîte prise d'air 3, Bouchon-boîte prise d'air 4 | Pièces d'hiver (rechange) | contreplaqué | 2 |
| P-07 | Bouchon-boîte prise d'air 2, Bouchon-boîte prise d'air 1 | Pièces d'hiver (rechange) | contreplaqué | 2 |
| P-08 | Bouchon-boîte prise d'air couvercle | Pièces d'hiver (rechange) | contreplaqué | 1 |
| P-09 | Bouchon-boîte prise d'air fond | Pièces d'hiver (rechange) | contreplaqué | 1 |
| P-10 | Poignée bouchon prise d'air 1, Poignée bouchon prise d'air 2, Poignée bouchon prise d'air 3 | Pièces d'hiver (rechange) | contreplaqué | 12 |
| E-01 | Entrée 1, Entrée 15 | Entrée | contreplaqué | 2 |
| E-02 | Entrée 2, Entrée 3… (13 noms) | Entrée | contreplaqué | 13 |
| B-01 | Baguette de cale 1, Baguette de cale 2 | Baguettes de cale (à couper) | contreplaqué | 2 |
| COR-03 | Face avant ext | Corps | contreplaqué | 1 |
| COR-04 | Face arrière ext | Corps | contreplaqué | 1 |
| COR-05 | Côté droit ext | Corps | contreplaqué | 1 |
| COR-06 | Côté gauche ext | Corps | contreplaqué | 1 |
| COR-07 | Dessous ext | Corps | contreplaqué | 1 |
| COR-08 | Plancher int | Corps | contreplaqué | 1 |
| COR-09 | Face avant int | Corps | contreplaqué | 1 |
| COR-10 | Face arrière int | Corps | contreplaqué | 1 |
| COR-11 | Côté droit int | Corps | contreplaqué | 1 |
| COR-12 | Côté gauche int | Corps | contreplaqué | 1 |
| COR-13 | Pièce en C sous le cadre | Corps | contreplaqué | 1 |
| COR-14 | Plaque isolant entrée gauche, Plaque isolant entrée droite | Corps | contreplaqué | 2 |
| COR-15 | Plaque isolant entrée dessous | Corps | contreplaqué | 1 |
| T-03 | Fourreau gaine toit 1, Fourreau gaine toit 2… (13 noms) | Toit | contreplaqué | 13 |
| T-04 | Face avant toit | Toit | contreplaqué | 1 |
| T-05 | Face arrière toit | Toit | contreplaqué | 1 |
| T-06 | Côté droit toit | Toit | contreplaqué | 1 |
| T-07 | Côté gauche toit | Toit | contreplaqué | 1 |
| T-08 | Dessus toit | Toit | contreplaqué | 1 |
| T-09 | Dessous toit | Toit | contreplaqué | 1 |
| T-10 | Baguette dessus toit gauche | Toit | contreplaqué | 4 |
| T-11 | Baguette dessus toit droite | Toit | contreplaqué | 4 |
| T-12 | Baguette dessus toit avant | Toit | contreplaqué | 4 |
| T-13 | Baguette dessus toit arrière 1 | Toit | contreplaqué | 4 |
| T-14 | Baguette dessus toit arrière 2 | Toit | contreplaqué | 4 |
| T-15 | Plaque caméra extérieure | Toit | contreplaqué | 1 |
| T-16 | Cadre toit haut, Cadre toit milieu, Cadre toit bas | Toit | contreplaqué | 3 |
| T-17 | Face avant caméra 1, Face arrière caméra 1 | Toit | contreplaqué | 2 |
| T-18 | Côté droit caméra 1, Côté gauche caméra 1 | Toit | contreplaqué | 2 |

Total : 219 plaques, 80 codes (sur la planche par défaut de 400 × 320 mm les 219 pièces tiennent sur 16 planches : 11 de contreplaqué 3 mm et 5 d'okoumé 5 mm ; sur 400 × 400, 14 planches).

## Réglages à calibrer
Valeurs de départ du constructeur (tableau « Sculpfun E1 Paramètres », laser bleu 21 W, contreplaqué de tilleul 3 mm) : coupe 750 mm/min, 100 %, 1 passe ; gravure 5000 mm/min, 10 % ; plafond de puissance 100 %. Elles dépendent du contreplaqué, de la focale et de l'air assist : la **planche d'essai** découpe une grille de petits carrés (colonnes = vitesses, lignes = puissances) ; le tableau à l'écran donne la position de chaque carré. Retenir le couple qui détache le carré proprement avec le moins de brûlure.

## Sécurité
- Lunettes de protection (445 nm), surveillance permanente, arrêt d'urgence matériel à portée, extincteur ou eau proche, air assist allumé.
- Rien n'est envoyé à la connexion ; chaque envoi demande un clic, la découpe demande en plus la liste de sécurité cochée.
- **Arrêt** (rouge, visible pendant l'envoi) : pause `!` (le laser s'éteint), réinitialisation `0x18`, `M5`. La machine passe alors en alarme 3 : déverrouiller (`$X`) et **refaire l'origine**.
- Pause (`!`) / Reprendre (`~`). Alarme ou erreur GRBL en cours de route : l'envoi s'arrête.
- Liaison USB perdue : grand avertissement ; GRBL éteint le laser à la réinitialisation, mais vérifier la machine immédiatement.
- Jamais de commande de puissance dans les déplacements manuels ni le cadre.

## Machine simulée
« Machine simulée » (sans laser branchée) imite GRBL 1.1 (statuts, `$$`, `$J=`, `!`, `~`, 0x18, 0x85, alarmes, mode laser) à vitesse ×10 : pour s'entraîner, sans rien envoyer à une vraie machine. Boutons pour simuler une alarme ou une coupure USB, case pour simuler `$32=0`.
