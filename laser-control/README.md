# Laser Control

Pilotage d'une laser **Sculpfun E1 Pro 21 W** (contrôleur GRBL 1.1 ; assistance d'air `M8` / `M9` activée par défaut) depuis le navigateur, par l'API Web Serial : connexion USB, déplacements, origine, cadre à vide, planche d'essai, aperçu du trajet, envoi en flux avec Pause / Reprise / Arrêt, et une **machine simulée** pour s'entraîner sans laser. Projet autonome : ce dossier se copie seul, il ne dépend de rien d'autre.

## Démarrer

```sh
npm install
npm run dev        # http://localhost:5176
```

Ouvrir la page dans **Chrome ou Edge** (Firefox et Safari n'ont pas Web Serial ; la page doit être en HTTPS ou sur `localhost`).

| Commande | Rôle |
|---|---|
| `npm run dev` | serveur de développement (port 5176) |
| `npm run build` | compile dans `dist/` (chemins relatifs, à ouvrir depuis n'importe quel hébergeur) |
| `npm run typecheck` | vérification TypeScript |
| `npm test` | tests (G-code, statut, envoi en flux avec la machine simulée, imports, autonomie du dossier) |
| `npm run export -- <dossier>` | copie ce projet ailleurs (voir plus bas) |

## Utilisation

1. **Charger un travail** : « Ouvrir un SVG / G-code… », ou déposer le fichier n'importe où sur la page. « Exemple » charge une planche de démonstration.
   - **SVG** : 1 unité = 1 mm, le `viewBox` est la planche, l'origine du SVG est en haut à gauche. **Trait noir = coupe, trait bleu = gravure** ; le reste (cadre gris, textes, remplissages) est ignoré. Seuls les contours **fermés** sont gardés (`path`, `rect`, `circle`, `ellipse`, `polygon`, `polyline`, `line`, `transform`). Les trous (un contour dans un autre) sont coupés avant le contour extérieur, les petites pièces d'abord. La gravure passe avant la coupe, à sa propre vitesse et puissance.
   - **G-code** (`.gcode`, `.nc`, `.ngc`, `.tap`, `.txt`) : envoyé tel quel, avec trois protections : les lignes `$…` (réglages de la machine) sont retirées, toute valeur `S` au-dessus du plafond de puissance est ramenée au plafond, `M5` est ajouté à la fin si besoin.
2. **Connecter** la laser (ou « Machine simulée »). Vérifier `$32 = 1` (mode laser) ; sinon la découpe reste verrouillée.
3. Amener la tête sur le **coin bas-gauche** du matériau avec les flèches, puis « Origine ici ».
4. « Tracer le cadre à vide » : la tête suit le rectangle des pièces, **laser éteint** (`M5` et déplacements `$J=`).
5. Régler vitesse, puissance, passes, plafond ; **lancer d'abord la planche « Essai puissance × vitesse »** (dernière de la liste : 6 × 6 carrés, avec la puissance et la vitesse gravées à côté de chaque ligne et colonne).
6. Vérifier l'aperçu du trajet, « Lancer la découpe… » puis confirmer (une seule confirmation, sans liste à cocher). Pendant l'envoi : Pause, Reprise, **Arrêt** (pause `!`, réinitialisation 0x18, `M5`) toujours visible.

Rien n'est envoyé sans ton clic et une confirmation ; charger ou déposer un fichier ne lance jamais la découpe.

## Branchement et sécurité

- Câble USB branché, laser allumée, aucun autre programme connecté au port (LaserGRBL, LightBurn, autre onglet).
- Windows : si aucun port n'apparaît, installer le pilote **CH340** (puce USB de la carte).
- Une laser de 10 W peut enflammer le bois : ne jamais la laisser sans surveillance, extincteur à portée, air assist actif.
- Valeurs de départ **prudentes, à calibrer** (300 mm/min, 60 %, 3 passes, plafond 80 %) pour un contreplaqué de 3 mm : elles dépendent du matériau, de la focale et de l'air assist.
- Zone de travail : 410 × 400 mm. L'origine de travail (G54) est le coin bas-gauche, X à droite, Y vers l'arrière de la machine.

## Format d'entrée : `LaserJob`

```ts
interface LaserJob {
  widthMm: number; heightMm: number;                 // la planche
  layers: { cut: Polyline[]; engrave?: Polyline[] }; // polylignes fermées en mm, origine en bas à gauche
  pieces?: { name: string; contours: Polyline[] }[]; // facultatif : les contours de coupe par pièce (ordre exact)
  frame?: { minX; minY; maxX; maxY };                // facultatif : rectangle du cadre à vide
  title?: string;
}
```

`buildGcode(job, options)` (`src/job/buildGcode.ts`) produit le programme (`GcodeJob`) ; une application hôte fabrique des `LaserItem` (`{ label, fileName, job }`) et les passe à `useLaserMachine(items, area)`. Voir `src/index.ts` pour l'API publique (`useLaserMachine`, `LaserPanel`, `LaserMachineModal`, `LaserSection`, `parseSvg`, `parseGcode`…).

## Arborescence

```
src/grbl/        logique GRBL pure : client, streamer (character counting 127 octets), gcode, status, errors, mockGrbl, webSerial
src/job/         LaserJob, buildGcode, import SVG et G-code, ordre de coupe
src/hooks/       useGrbl, useGcodeJob, useLaserMachine, usePersistentState…
src/components/  ConnectionBar, JogPad, FramePanel, CutSettings, TestCard, GcodePreview, SendPanel, GrblConsole, FilesPanel…
src/ui/          briques d'interface (un dossier par brique)
src/App/         la page autonome
tests/           vitest
scripts/export.mjs
```

Les imports sont **relatifs** (jamais `@/`) : l'application du nichoir importe ce code sous l'alias `@laser`, où `@/` désignerait son propre `src/`. Le test `tests/autonome.test.ts` échoue si un fichier importe hors du dossier ou si une dépendance n'est pas déclarée.

## Exporter

```sh
npm run export -- ../ailleurs/laser-control
```

Copie le dossier **sans** `node_modules` ni `dist` dans un dossier cible vide, puis vérifie que la copie s'installe et se compile seule (`npm install`, `typecheck`, `build`, `test`). Options : `--no-check` (copie seulement), `--keep-modules` (garde `node_modules` de la copie). On peut aussi simplement copier le dossier à la main.

## Utilisé par l'application du nichoir

Le dépôt du nichoir importe ce dossier par l'alias `@laser` (sans copie) ; seul l'adaptateur `src/features/laser/adapter.ts` convertit ses planches en `LaserJob`. Les briques `src/ui/` d'ici sont une copie de celles de l'application du nichoir : les deux jeux sont à tenir d'accord à la main.
