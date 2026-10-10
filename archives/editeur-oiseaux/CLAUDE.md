# Éditeur d'oiseaux low poly — nouvelle app

Ce dossier accueille une **nouvelle application, repartie de zéro**, dédiée à l'édition d'oiseaux en 3D low poly.
Langue de travail : français (UI, commentaires, messages de statut), comme dans l'ancien projet.

## Deux dossiers

| Dossier | Rôle |
|---|---|
| `ancien-monde-lowpoly/` | **Ancien projet, en lecture seule.** Le « monde low poly » complet (arbres, terrain, eau, météo, animaux…). Il contient un *Atelier d'animaux* qui est le prototype direct de la nouvelle app. On s'en sert comme référence et réservoir de code à reprendre. Ne pas le modifier. |
| racine (`src/`, `package.json`…) | La **nouvelle app**, à créer. Vide au départ. |

Pour lancer l'ancien projet si besoin de comparer : `cd ancien-monde-lowpoly && npm run dev`.

## Objectif de la nouvelle app

Une app **uniquement** centrée sur un oiseau : on l'assemble à partir de formes (corps-œuf, tête, bec, yeux, ailes, queue, pattes), on le déforme, on le colore, on le pose, on l'anime en aperçu, on l'enregistre et on l'exporte. Pas de terrain, pas d'arbres, pas de météo, pas de scène « monde ».

Ce qu'on garde comme philosophie de l'ancien projet :
- **Rendu flat-shaded, une couleur par face, `vertexColors`** (voir `finish()` / `softFinish()` dans l'ancien `main.js`, lignes ~118–150).
- **Tout est déterministe** : `mulberry32(seed)` et `hashPos()` pour les variations, jamais `Math.random()` dans la géométrie.
- Clic gauche = sélection / manipulation ; **molette = tourner la caméra, clic droit = déplacer** (`controls.mouseButtons = { LEFT: -1, MIDDLE: ROTATE, RIGHT: PAN }`).
- **Repère de l'app : X = droite, Y = avant de l'oiseau, Z = haut** (`Object3D.DEFAULT_UP = (0,0,1)`, `camera.up = Z`). Les formes sont dessinées en repère three.js (avant +Z, haut +Y) puis passées par `toAppFrame()` dans `shapes/index.ts`. Positions / tailles dans l'UI : X, Y (avant), Z (hauteur). Les sauvegardes d'avant (version 1, Y vertical) sont migrées par `migrateYUp()`.
- Message de statut qui s'efface seul après quelques secondes.

## Ce qu'il faut REPRENDRE de l'ancien code (`ancien-monde-lowpoly/src/main.js`)

Le fichier fait ~9 400 lignes et mélange tout. Ne pas le copier en bloc : en extraire les morceaux ci-dessous et les **découper en modules**.

### 1. L'Atelier d'animaux (lignes ~5032–7575) — le cœur à reprendre
C'est déjà un éditeur d'oiseau fonctionnel. Modèle de données :

```js
// une pièce de l'animal
{ uid, shape, pos:[x,y,z], rot:[°,°,°], scl:[sx,sy,sz], color, mirror,
  detail,          // niveau de maillage 1..8 (AT_DETAIL0 = valeurs par défaut par forme)
  smooth,          // normales lissées ou facettes
  verts,           // sommets déplacés après sculpture (sinon null : forme régénérée)
  parent, link:{p,q,axis,arc}, sink,   // rotule : accroché à une pièce parente en un point
  pair, sym:{ref,axis},               // paire gauche/droite synchronisée en miroir
  grp, cuts:[{n,d,keep}], dots, params, color2 }
```

Fonctions clés à porter :
- `atelierGeo(shape, L, params)` (~5177) : fabrique la géométrie de départ de chaque forme (`AT_SHAPES` ~5060 : œuf, tête, bec droit/recourbé haut/bas, œil, aile, plume, lame, bassin, cuisse, jambe, patte, griffe, queue, patate, cylindre, cône…).
- `atelierShellGeo`, `atelierEggShellGeo`, `atelierGridGeo` (~5068–5175) : ailes et manteau « peau du corps » épaissie, coupées par un plan.
- `atelierPartGeo(def)` (~5335) : géométrie finale = forme + `verts` sculptés + `cuts`.
- `atelierClipGeo` (~5305) : coupe par un plan.
- Hiérarchie / rotules : `atelierWorld`, `atChildWorld`, `atLinkBase`, `atLocalOf`, `atelierSetWorld`, `atelierReparent`, `atelierBallLink` (~5540–5660, 6984). Un enfant suit position + orientation du parent **sans hériter de son étirement**.
- Paires miroir : `atelierMirrorOf`, `atelierSyncPair`, `AT_MIRROR` (~5597–5640).
- Interaction souris : `atelierPointerDown/Move/Up`, `atelierPick`, modes `move | rotate | stretch | draw`, anneaux de rotation par axe, poignées d'étirement un côté / deux côtés (~6701–6960).
- Plan de coupe déplaçable et rotatif, trace la section (~5805–5980).
- Historique annuler/rétablir par instantanés JSON avec stabilisation 300 ms (`AT_H`, ~6636–6680) ; brouillon auto dans `localStorage` (`AT_DRAFT_KEY`).
- Sérialisation : `atelierPartsOut()`, `atelierSerialize()` (~6607) ; bibliothèque `customLibrary` dans `localStorage` (`lowpoly-custom-animals`).
- `bakeCustom(def)` (~5345) : fusionne toutes les pièces en un seul mesh coloré par face, pieds posés sur y = 0 → base pour l'export `.glb` (voir `GLTFExporter`, section ~9406).

### 2. Modèles prêts à l'emploi (presets)
- `atelierBuildGreatTit()` mésange charbonnière (~7137), `atelierBuildHoopoe()` huppe fasciée (~7170), `atelierBuildHoopoeFlying()` (~7215).
- Briques réutilisables : `atelierAddTitHead` (tête + bec + yeux + joues), `atelierAddTitBelly`, `atelierAddBandWings` (ailes en bandes colorées + manteau), `atelierAddBandTail`, `atelierAddCrest` (huppe), `atelierAddRearPatch/RearCone`, `atelierAddTitLegs`, `atelierAddLegs`, `atelierAddHead`, `atelierWingOnBody` (~6007–7130).
- Ailes de mésange repliées sur les flancs : section ~5980.

### 3. Animation d'aperçu (~6413–6635)
`AT_MOVES` : `headPitch`, `headYaw`, `bow`, `lean`, `all`. Boucle 6 s, ne modifie aucun réglage, restaure `part.base` à l'arrêt. Bon point de départ pour un système de poses/animations.

### 4. Oiseaux « codés en dur » (à piocher pour les formes)
- Héron, flamant, ibis, héron garde-bœufs (~2481–2888) : squelette articulé `RIG_ORDER` / `RIG_PARENT` / `JOINT_NAMES`, `rigSink()`, `attachRig()` — cou en 3 maillons, hanches, genoux, ailes.
- Pic (~2889), bergeronnette (~3224), sarcelle (~3227), martin-pêcheur (~3315), mouette et hirondelle en vol (`wingGeos` ~3747).
- Mode « pose » avec points bleus sur les articulations et anneaux X/Y/Z (`enterPose` ~7576–7738).
- `birdTone(hex, dl, alba)` (~2413) : palette, variante pastel.

### 5. UI (`ancien-monde-lowpoly/src/ui/`)
- `AtelierUi.jsx` : liste complète des contrôles de l'atelier (formes, plan de coupe, pièces, modes, verrous d'axes, curseurs pos/rot/scl, couleur, symétrie, calage, enfoncement). Bonne spec fonctionnelle.
- `common.jsx` : `Slider`, `Check`, `Select`, `Btn`, `Section`…
- `behaviors.js` : raccourcis clavier (Ctrl+Z/Y, `?` aide, `[` panneau), accordéon.
- `style.css` lignes 158–174 : style du panneau atelier.

## Ce qu'il NE faut PAS reprendre
Terrain, pinceau, eau, pierres, herbe, fleurs, insectes, poissons, grenouilles, arbres, murs, ponts, escaliers, bancs, panneaux, chemins, météo (`weather.js`), murs (`walls.js`), scènes multiples, arbres de Paris, feuilles qui tombent.

## Architecture de la nouvelle app (en place)

Stack : **Vite + React 19 + TypeScript + Tailwind v4 + Three.js + zustand**. Alias `@/` → `src/`.

Point faible de l'ancien : un `main.js` monolithique qui pilote le DOM par `getElementById`, React ne rendant qu'une fois. **Ne pas refaire ça** : ici l'UI est contrôlée, le store est la source de vérité, le moteur s'y abonne.

```
src/
  engine/              # Three.js pur, aucune dépendance React
    types.ts           # Part, ShapeKind, Vec3, SHAPE_LABELS, ROTATION_AXES (le corps ne bascule qu'autour de X, axe rouge) + lockRotation()
    palette.ts         # albaTone() (pastel), hashPos() (bruit déterministe), couleurs d'ambiance
    finish.ts          # finishGeometry() : une couleur par face + normales plates / lissées
    shapes/            # une forme = un fichier ; index.ts : shapeGeometry(), DETAIL_MAX (finesse max par forme, = défaut), triangleCount() (cache),
                       #   toAppFrame() (repère Z haut), stretchY() : étirement d'un seul côté (part.yStretch = [avant, arrière]) ; scl reste symétrique
      eggBody.ts       # corps : œuf couché, gros bout devant (avant = +Z)
      head.ts, bill.ts, eye.ts, wing.ts, tail.ts   # tête, bec plat, œil, aile repliée, queue en éventail
    presets/mallard.ts # MALLARD_MALE : le colvert complet ; sert aussi de valeurs par défaut au store
    scene.ts           # BirdScene : renderer, caméra, lumières, sol carré + grille, axes du monde, sync(parts, selectedId),
                       #   copies miroir (part.mirror), axes locaux (part.showAxes), matériaux transparents (part.transparent),
                       #   souris : clic = sélection, glissé = déplacement, anneau (couleur de l'axe) = rotation autour du premier axe autorisé
    axes.ts            # makeAxes() / resizeAxes() : trois flèches X rouge, Y vert, Z bleu
  store/bird.ts        # zustand + persist (clé localStorage 'oiseaux-brouillon') : parts, selectedId, actions, loadParts(preset),
                       #   historique undo/redo (past/future, non persisté ; beginGesture() = une étape par geste souris,
                       #   updatePart(id, patch, tag) regroupe les changements de curseur rapprochés)
  store/library.ts     # jeux de paramètres enregistrés par nom (clé localStorage 'oiseaux-bibliotheque') : save / remove
  ui/                  # React contrôlé (Tailwind) ; ne touche jamais aux meshes
    Panel.tsx          # colonne de gauche : nom, modèles, enregistrements, ajout de formes, liste des pièces (+ total de triangles), éditeur
    Library.tsx        # « Enregistrer dans » + nom, liste des jeux enregistrés (Charger / ×)
    PartEditor.tsx     # curseurs taille / position / rotation, couleur, finesse, lissage
    Viewport.tsx       # monte BirdScene, lui pousse le store à chaque changement
    Slider.tsx
  App.tsx, main.tsx, style.css (@import "tailwindcss")
```

Flux : UI → actions du store → `Viewport` appelle `scene.sync(parts, selectedId)` → la scène crée / met à jour / supprime les meshes (géométrie reconstruite seulement si forme, finesse, couleur ou lissage change). Gestes souris → `events.onSelect / onMove / onRotate / onGestureStart` → store. Raccourcis clavier dans `App.tsx` (Ctrl+Z, Ctrl+Y, Suppr, Échap).

Ajouter une forme = 1) un fichier dans `engine/shapes/`, 2) l'ajouter à `ShapeKind` + `SHAPE_LABELS` + `shapeGeometry()`, 3) ses valeurs par défaut dans `DEFAULTS` du store, 4) un bouton dans `Panel.tsx`.

À venir (reprendre de l'ancien atelier) : rotules parent/enfant (aujourd'hui tourner le corps ne tourne pas la tête), sculpture de sommets, plan de coupe, zones de couleur sur une pièce, animations d'aperçu, export glb.

## Référence espèce
`docs/colvert.md` : fiche du canard colvert (proportions en fraction du corps, couleurs hex réalistes et pastel, posture, repères de silhouette). S'y référer pour placer et colorer les pièces ; même format à produire pour chaque nouvelle espèce.

## Conventions
- Commentaires et libellés en français, code en anglais.
- Commits : Conventional Commits en anglais (`feat:`, `fix:`, `refactor:`…).
- Pas de `Math.random()` dans la génération de géométrie.
- Tester dans le navigateur avec `npm run dev` avant de déclarer une fonctionnalité finie.


## Commandes
```sh
npm run dev        # http://localhost:5174
npm run typecheck  # tsc --noEmit
npm run build
```
