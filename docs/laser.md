# Pilotage de la laser (Sculpfun S30 Pro)

L'app pilote la découpeuse directement depuis le navigateur (API **Web Serial**) : connexion USB, déplacements, cadre à vide, envoi du G-code planche par planche. Section « Découpe laser » du panneau de gauche, bloc « Machine » → « Ouvrir le pilotage de la laser ».

## Matériel et branchement
| Élément | Valeur |
|---|---|
| Machine | Sculpfun S30 Pro, diode 10 W, air assist |
| Contrôleur | GRBL 1.1, USB série 115200 bauds 8N1 |
| Zone | 410 × 400 mm (planche par défaut de l'app) |
| Navigateur | Chrome ou Edge, page en HTTPS ou sur `localhost` (Firefox et Safari : pas de Web Serial) |

1. Brancher le câble USB, allumer la machine.
2. Windows : si aucun port n'apparaît, installer le pilote **CH340** (puce USB de la carte).
3. Fermer tout autre logiciel connecté au port (LaserGRBL, LightBurn, autre onglet).
4. « Connecter la laser » : le navigateur demande de choisir le port (clic obligatoire).

## Mise en place d'une découpe
1. Connexion ; vérifier `$32 = 1` (mode laser). Sinon l'app avertit, verrouille la découpe et propose `$32=1` après confirmation.
2. Poser et fixer la planche, régler la focale.
3. Avec les flèches, amener la tête sur le **coin bas-gauche** du matériau, puis « Origine ici » (`G10 L20 P1 X0 Y0`).
4. « Tracer le cadre à vide » : la tête suit le rectangle des pièces, **laser éteint** (`M5` et déplacements `$J=`, qui ne peuvent pas allumer le laser).
5. Régler vitesse, puissance, passes ; **lancer d'abord la planche d'essai**.
6. Vérifier l'aperçu (coupes rouges, déplacements rapides en pointillés gris), puis « Lancer la découpe… », cocher la liste de sécurité.

## Convention d'axes
Origine de travail = coin **bas-gauche** de la planche vue de dessus, X vers la droite, Y vers l'**arrière** de la machine. Le SVG de l'app a y vers le bas : `Y_machine = H − y_svg`. Unités en mm, `G21 G90`, système G54.

## G-code produit
`G21 G90 G54 G94`, `M5`, `M4 S0` (mode laser dynamique), puis pour chaque contour un `G0` (laser éteint) et des `G1` avec `F` (vitesse) et `S` (puissance = % × `$30` / 100, jamais au-dessus du plafond ni de `$30`), enfin `M5`, retour `G0 X0 Y0`, `M5`. Les pièces sont coupées des plus petites aux plus grandes, **trous avant le contour extérieur** de chaque pièce. Passes : toute la planche puis on recommence, ou contour par contour. **Les noms des pièces (en bleu dans les SVG) ne sont pas gravés.**

## Réglages à calibrer
Valeurs de départ prudentes : 300 mm/min, 60 %, 3 passes, plafond de puissance 80 %. Elles dépendent du contreplaqué, de la focale et de l'air assist : la **planche d'essai** découpe une grille de petits carrés (colonnes = vitesses, lignes = puissances) ; le tableau à l'écran donne la position de chaque carré. Retenir le couple qui détache le carré proprement avec le moins de brûlure.

## Sécurité
- Lunettes de protection (445 nm), surveillance permanente, arrêt d'urgence matériel à portée, extincteur ou eau proche, air assist allumé.
- Rien n'est envoyé à la connexion ; chaque envoi demande un clic, la découpe demande en plus la liste de sécurité cochée.
- **Arrêt** (rouge, visible pendant l'envoi) : pause `!` (le laser s'éteint), réinitialisation `0x18`, `M5`. La machine passe alors en alarme 3 : déverrouiller (`$X`) et **refaire l'origine**.
- Pause (`!`) / Reprendre (`~`). Alarme ou erreur GRBL en cours de route : l'envoi s'arrête.
- Liaison USB perdue : grand avertissement ; GRBL éteint le laser à la réinitialisation, mais vérifier la machine immédiatement.
- Jamais de commande de puissance dans les déplacements manuels ni le cadre.

## Machine simulée
« Machine simulée » (sans laser branchée) imite GRBL 1.1 (statuts, `$$`, `$J=`, `!`, `~`, 0x18, 0x85, alarmes, mode laser) à vitesse ×10 : pour s'entraîner, sans rien envoyer à une vraie machine. Boutons pour simuler une alarme ou une coupure USB, case pour simuler `$32=0`.
