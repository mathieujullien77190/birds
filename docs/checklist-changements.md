# Checklist : quand je change X, je mets à jour Y

Le dépôt a beaucoup de fichiers qui vont ensemble (le modèle, ses références de test, le schéma, les prix, le Pi, le site du Pi, le simulateur, les documents). Ce tableau dit, pour chaque type de changement, **ce qui le déclenche, les fichiers à toucher, et la commande qui vérifie**. Il est lu par les skills du projet (`.claude/skills/`) et contrôlé par `tests/coherence.test.ts` (chaque fichier cité ici doit exister).

**Avant de publier, toujours : `npm run check`** (tsc, lint, tests et couverture, pytest, builds, sous-projets). `npm run check -- --fast` saute les builds ; `npm run check -- --only=python` ne lance qu'une étape.

Légende de la dernière colonne : **auto** = un test échoue si on oublie ; **à la main** = rien ne détecte l'oubli, c'est à relire.

## 1. Ajouter, modifier ou retirer une pièce du nichoir

Déclencheur : une plaque, un composant, un fil, une nappe, un pavé ou un groupe change dans `makeNest`.

| À mettre à jour | Fichier | Vérifie |
| --- | --- | --- |
| La pièce elle-même (nom, taille, position, groupe, `special`) | `src/birdhouse/model/nest/makeNest.ts` | `npm test` |
| Nouveau type `special` : ajouter au type `Plank['special']` | `src/birdhouse/model/types.ts` | `tsc` ; **auto** : `tests/coherence.test.ts` (chaque `special` a une fabrique ou est connu comme sans dessin) |
| Son dessin 3D : une fabrique dans `part/` et une ligne dans la table `FACTORIES` | `src/birdhouse/three/factories/part/index.ts` | **auto** : `tests/parts.golden.test.ts` |
| Une nouvelle propriété de `Plank` qui change le dessin : l'ajouter à la clé de géométrie (`plankShapeKey`) | `src/birdhouse/three/factories/plank.ts` | `tests/plankKey.test.ts` |
| Couleur de la pièce | `src/birdhouse/three/registry/palette.ts` | `tests/parts.golden.test.ts` |
| Pièce de ventilation : ajouter son nom à `VENT_PIECES` (groupe « Ventilateur ») | `src/birdhouse/model/nest/makeNest.ts` | **auto** : `tests/coherence.test.ts` (chaque alternative de `VENT_PIECES` correspond à une pièce générée) |
| Pièce cachée à la création (isolant, toit en chêne) | `HIDDEN_AT_CREATION` dans `src/features/viewer/constants.ts` | **auto** : `tests/coherence.test.ts` |
| Lien du composant (constructeur ou revendeur) | tableau `LINKS` de `makeNest.ts` | **auto** : `tests/coherence.test.ts` (chaque motif correspond à une pièce) |
| Références golden : régénérer **puis relire le diff** | `UPDATE_GOLDEN=1 npx vitest run`, fichiers de `tests/golden/` | `npm test` (ne jamais régénérer à l'aveugle) |
| Découpe laser : les plaques de bois sont rangées toutes seules ; MDF = `material: 'mdf'` et okoumé 5 mm de l'habillage / de la boîte caméra 2 = `material: 'okoume'` + `depth` (planches à part) ; une pièce non découpée est un `special` | `src/birdhouse/model/sheets/index.ts` | `tests/bars.test.ts`, `tests/model.golden.test.ts` |
| Un fil ou une nappe : il ne doit rien traverser | `tests/geomChecks.ts`, `tests/wireChecks.ts` | **auto** : `tests/wiresSolid.test.ts`, `tests/ventilation.test.ts` |
| Schéma électronique (si c'est de l'électronique) : voir la section 2 et la section 7 | `docs/schema-electronique.md` | `tests/coherence.test.ts` |
| Lien pièce ↔ schéma : tableau `MAP` | `src/features/schema/SchemaPanel/constants.ts` | **auto** : `tests/coherence.test.ts` (chaque nœud de `MAP` existe dans le schéma) |
| Fiche cliquable d'un nouveau module : `FICHES` et section `###` du document | `src/features/schema/SchemaPanel/constants.ts`, `docs/schema-electronique.md` | **auto** : `tests/coherence.test.ts` |
| Poids et prix du composant (tableau « Prix » : 4 colonnes, un lien ou la référence exacte) | `docs/schema-electronique.md` | **auto** : `tests/docLinks.test.ts` |
| Mémoire du projet | `CLAUDE.md` (remplacement ciblé, jamais une réécriture) | à la main |
| README si c'est visible de l'extérieur | `README.md` | à la main |
| Après la publication : dans le navigateur, « Tout supprimer » puis « Créer le nichoir » pour régénérer le nichoir enregistré (voir `docs/checklist-changements.md` § 12) | l'app | à la main |

## 2. Un fil, un branchement, une broche

| À mettre à jour | Fichier | Vérifie |
| --- | --- | --- |
| Le fil 3D (nom, chemin, couleur, diamètre) | `src/birdhouse/model/nest/makeNest.ts` | `tests/wiresSolid.test.ts`, `tests/ventilation.test.ts` |
| Le schéma mermaid : nœud, flèche, `classDef`, **et la liste `linkStyle n` (un par flèche, dans l'ordre de la source : en ajouter ou retirer une flèche oblige à refaire toute la liste)** | `docs/schema-electronique.md` | **auto** : `tests/coherence.test.ts` (autant de `linkStyle` que de flèches, tous les `class` sont définis) |
| Tableau « Branchements, fil par fil » (broche physique, GPIO, couleur) | `docs/schema-electronique.md` | à la main |
| Fiche du fil (de → vers, rôle, tension, courant, raccord, broches) : `TABLE` de `wireInfo` | `src/birdhouse/model/wires/wireInfo.ts` | **auto** : `tests/wireInfo.test.ts` (aucun fil sans fiche, broches du tableau « Branchements ») |
| Nom du fil dans le schéma : `MAP` (et `schemaKeys`) | `src/features/schema/SchemaPanel/constants.ts` | **auto** : `tests/coherence.test.ts` |
| GPIO côté Pi : constantes et docstring | `pi/nichoir.py` | `npm run check` (pytest) |
| Brochage résumé | `pi/README.md`, `docs/logiciel.md` | à la main |
| « Vérification que rien ne coince » du document | `docs/schema-electronique.md` | à la main |

## 3. Le programme du Pi (`pi/nichoir.py`)

Déclencheur : une clé de `etat`, un comportement, une sécurité, un réglage change.

| À mettre à jour | Fichier | Vérifie |
| --- | --- | --- |
| Le programme et ses constantes | `pi/nichoir.py` | `pytest pi/tests` (via `npm run check`) |
| Tests Python (mode simulé `NICHOIR_MOCK=1`) | `pi/tests/` | `pytest` ; couverture ligne et branche à 100 % |
| Types du site : `DeviceState` (miroir de `etat`) | `pi/site/src/types/device.ts` | **auto** : `pi/tests` compare les clés de `/api/etat` au type |
| Client de l'API, hooks, composants du site | `pi/site/src/api/index.ts`, `pi/site/src/hooks/`, `pi/site/src/components/` | `npm --prefix pi/site test` |
| **Recompiler et committer le site compilé** | `npm run build:pi` puis `pi/web/` | `npm run check` (avertit si `pi/web` diffère des sources) |
| Simulateur : le code Python lancé dans le navigateur (`BOOT`), l'appel des routes, les essais `PI_TESTS`, le type `PiState` | `src/birdhouse/PiSimulator.tsx` | à la main (dans le navigateur, bouton « 🐍 Pi ») |
| Pannes et temps simulés (`MOCK_FORCE`, `MOCK_PANNES`, `MOCK_NUIT`, `SIM_ACCEL`) | `pi/nichoir.py` et `BOOT` de `PiSimulator.tsx` | `pytest` |
| Documents | `docs/logiciel.md`, `pi/README.md`, `CLAUDE.md` | à la main |
| Dépendances Python | `pi/requirements.txt` (Pi), `pi/requirements-dev.txt` (tests) | `npm run check` |

## 4. Une nouvelle route de l'API

| À mettre à jour | Fichier | Vérifie |
| --- | --- | --- |
| La route Flask | `pi/nichoir.py` | `pytest pi/tests` |
| Sa fonction dans le client | `pi/site/src/api/index.ts` | **auto** : `pi/tests` (chaque route `/api/…` existe côté client) ; `pi/site/tests/` |
| Le simulateur appelle les routes directement : l'ajouter à la doublure de Flask | `BOOT` de `src/birdhouse/PiSimulator.tsx` | à la main |
| Documents : liste des routes | `docs/logiciel.md`, `pi/README.md` | à la main |
| Recompiler le site | `npm run build:pi` | `npm run check` |

## 5. Un réglage du mode automatique

| À mettre à jour | Fichier | Vérifie |
| --- | --- | --- |
| Valeur par défaut et bornes : `AUTO_DEFAUT` et `AUTO_LIMITES` (même liste de clés) | `pi/nichoir.py` | `pytest pi/tests` |
| Relecture de `reglages.json` (et ancienne clé `bouche`) | `pi/nichoir.py` | `pytest pi/tests` |
| Type `AutoSettingKey` | `pi/site/src/types/device.ts` | `tsc` du site |
| Champ du formulaire : `AUTO_FIELDS` (clé, libellé, unité, min, max, pas : mêmes bornes que `AUTO_LIMITES`) | `pi/site/src/components/AutoFan/constants.ts` | `npm --prefix pi/site test` |
| Essai du simulateur qui l'exerce | `PI_TESTS` de `src/birdhouse/PiSimulator.tsx` | à la main |
| Documents : tableau des réglages | `docs/logiciel.md`, `pi/README.md` | à la main |

## 6. Le pilotage de la laser

`laser-control/` est la **source de vérité** (projet autonome). L'app ne le copie pas : elle l'importe par l'alias `@laser`.

| À mettre à jour | Fichier | Vérifie |
| --- | --- | --- |
| Le code GRBL, G-code, import SVG | `laser-control/src/grbl/`, `laser-control/src/job/` | `npm --prefix laser-control test` (couverture à 100 %) |
| L'interface du projet autonome | `laser-control/src/components/`, `laser-control/src/ui/` | `npm --prefix laser-control run typecheck` |
| Le format `LaserJob` ou `LaserItem` change : l'adaptateur de l'app | `src/features/laser/adapter.ts` | **auto** : `tests/laserAdapter.test.ts` |
| Brique d'interface copiée (`ui/`, `hooks/`, `lib/`) : **modifier les deux copies** | `src/ui/`, `src/hooks/`, `src/lib/` et `laser-control/src/…` | **auto** : `tests/coherence.test.ts` (les copies sont identiques) |
| Document et README | `docs/laser.md`, `laser-control/README.md` | à la main |
| Export autonome toujours possible | `laser-control/scripts/export.mjs` | `npm --prefix laser-control run export -- <dossier>` |

## 7. Un achat, un prix, un lien, la liste de courses

| À mettre à jour | Fichier | Vérifie |
| --- | --- | --- |
| Ligne du tableau « Prix » (groupe, élément, prix, lien **vérifié** ou référence exacte) | `docs/schema-electronique.md` | **auto** : `tests/docLinks.test.ts` |
| Le tableau interactif (cases à cocher, totaux) est fabriqué par `enhancePrices` : le format « Groupe \| Élément \| Prix \| Modèle exact / lien » ne doit pas changer | `src/features/docs/DocModal/helpers.ts` | `tests/docModal.test.ts` |
| Lien du composant dans « Pièces » | tableau `LINKS` de `makeNest.ts` | **auto** : `tests/coherence.test.ts` |
| Section « Montage sans soudure » (cordons Dupont, borniers, Wago) | `docs/schema-electronique.md` | à la main |
| Section « Liens des composants » | `docs/schema-electronique.md` | à la main |
| Poids | section « Poids » du même document | à la main |

Les liens doivent être **vérifiés** (ouvrir la page) : un lien mort connu est refusé par le test, mais un lien qui pointe vers un autre produit ne l'est pas.

## 8. Une couleur, une texture, un matériau, une constante 3D

| À mettre à jour | Fichier | Vérifie |
| --- | --- | --- |
| Palette nommée (jamais de couleur en dur dans une fabrique) | `src/birdhouse/three/registry/palette.ts` | `tests/parts.golden.test.ts` |
| Matériaux et textures partagés (accesseur `lazy`, jamais libérés avec une pièce) | `src/birdhouse/three/registry/materials.ts` | `tests/dispose.test.ts` |
| Constantes de vue, lumières, prise de vue | `src/birdhouse/three/constants.ts` | `tests/cameras.test.ts`, `tests/shotUp.test.ts` |
| Libération des ressources (`disposeObject3D`) | `src/birdhouse/three/dispose.ts` | `tests/dispose.test.ts` |
| Géométrie d'une pièce : les empreintes changent, **relire le diff** puis régénérer | `tests/golden/geometry-*.json`, `tests/golden/parts.json` | `UPDATE_GOLDEN=1 npx vitest run` |
| Architecture 3D (si la structure change) | `docs/architecture-3d.md` | à la main |

## 9. L'interface

| À mettre à jour | Fichier | Vérifie |
| --- | --- | --- |
| Composant de l'écran : un dossier par composant, avec son `index.ts` | `src/features/viewer/components/` | `tsc`, `npm run lint` |
| Logique d'un composant : dans un `helpers.ts` ou un hook, pas dans le JSX (c'est ce qui se teste) | `src/features/viewer/hooks/`, `*/helpers.ts` | `npm run coverage` |
| Brique partagée | `src/ui/` **et** la copie de `laser-control/src/ui/` si elle y existe | **auto** : `tests/coherence.test.ts` |
| **Clé `localStorage` : ne jamais la renommer sans migration** (ce sont les réglages déjà enregistrés de l'utilisateur) | `STORAGE` de `src/features/viewer/constants.ts` | **auto** : `tests/coherence.test.ts` (valeurs figées) |
| Réglages par défaut du nichoir (si le défaut change, changer la clé `plaques-nichoir-3` change aussi les réglages enregistrés : migration) | `NEST_DEFAULT` de `src/birdhouse/model/constants.ts` | `tests/model.golden.test.ts` |

## 10. Renommer, déplacer, ajouter un fichier

| À mettre à jour | Fichier | Vérifie |
| --- | --- | --- |
| Alias `@/` et `@laser` : **les trois** | `tsconfig.json`, `vite.config.ts`, `vitest.config.ts` | **auto** : `tests/coherence.test.ts` |
| Fichiers analysés par ESLint | `eslint.config.js` | `npm run lint` |
| Tableau des dossiers | `README.md`, `CLAUDE.md` | à la main |
| Notes de l'explorateur de code (`NOTE`), dossier `pi/` seulement visible | `src/features/docs/CodeBrowser/constants.ts` | **auto** : `tests/coherence.test.ts` (chaque clé de `NOTE` existe) |
| Test d'un nouveau dossier : couverture | `vitest.config.ts` (`coverage.include`, `exclude` avec la raison, `thresholds`) | `npm run coverage` |
| Document déplacé : liste `DOCS` | `src/features/docs/DocModal/constants.ts` | **auto** : `tests/coherence.test.ts` |

## 11. Une dépendance npm, une version

Il y a **trois** projets npm indépendants (racine, `pi/site/`, `laser-control/`) plus `tools/lint/`.

| À mettre à jour | Fichier | Vérifie |
| --- | --- | --- |
| La version, dans chaque projet qui l'utilise (react, typescript, vite, vitest : mêmes versions partout) | `package.json`, `pi/site/package.json`, `laser-control/package.json` | **auto** : `tests/coherence.test.ts` |
| Les verrous | `package-lock.json`, `pi/site/package-lock.json`, `laser-control/package-lock.json` (jamais à la main : `npm install`) | `npm run check` |
| Outils ESLint (TypeScript 5 pour typescript-eslint, à part) | `tools/lint/package.json` | `npm run lint` |
| Dépendance Python | `pi/requirements.txt`, `pi/requirements-dev.txt` | `npm run check` |
| Workflow de publication (Node 22, `npm ci`) | `.github/workflows/pages.yml` | à la main |

## 12. Publier

| Étape | Commande ou fichier |
| --- | --- |
| Tout vérifier | `npm run check` (doit finir par « ✔ ») |
| Relire les diffs de golden et de `pi/web` | `git diff --stat` |
| Si le site du Pi a changé : `npm run build:pi`, committer `pi/web/` | `pi/web/` |
| Commit : Conventional Commits **en anglais**, **sans `Co-Authored-By`, sans `Claude-Session`, sans mention d'assistant** (règle de l'utilisateur) ; `git add` avec des chemins explicites | `git add <fichiers>` |
| Push (par l'utilisateur) : le workflow construit et publie sur GitHub Pages | `.github/workflows/pages.yml` |
| Dans le navigateur, après un changement de modèle : « Tout supprimer » (il confirme en deux clics) puis « Créer le nichoir ». **À faire par l'utilisateur, pas par un agent** : `localStorage` est partagé entre les onglets | l'app |

## 13. Jour / nuit, caméras, LED, ventilateur dans le simulateur

| À mettre à jour | Fichier | Vérifie |
| --- | --- | --- |
| Jour / nuit : la nuit assombrit la vue 3D générale et les prises de vue des caméras | `src/features/viewer/hooks/useDayNight.ts`, `CameraShooter.lights` dans `src/birdhouse/three/cameraShooter.ts` | `tests/cameraShooter.test.ts`, `tests/cameras.test.ts` |
| Prise de vue de la caméra 1 (nid, IR) ou 2 (entrée) | `src/features/viewer/hooks/usePiCameraShot.ts`, `src/birdhouse/three/cameraShooter.ts` | `tests/cameraShooter.test.ts`, `tests/shotUp.test.ts` |
| Rotor du ventilateur qui tourne : `fanSpin`, `useFanSpeed`, prop `onFanSpeed` du simulateur | `src/birdhouse/three/fanSpin.ts`, `src/features/viewer/hooks/useFanSpeed.ts` | `tests/fanSpin.test.ts` |
| Faisceaux infrarouges : `irBeam`, `useIrBeams`, prop `onLeds` du simulateur | `src/birdhouse/three/irBeam.ts`, `src/features/viewer/hooks/useIrBeams.ts` | `tests/irBeam.test.ts` |
| Cassette translucide (désactivée, opacité cible 1) | `src/birdhouse/three/ghost.ts` | `tests/ghost.test.ts` |
| Documentation | `docs/architecture-3d.md`, `CLAUDE.md` | à la main |

## 14. Documents (`docs/*.md`)

| À mettre à jour | Fichier | Vérifie |
| --- | --- | --- |
| Chaque fichier de `docs/` est dans la liste `DOCS` (onglets de la fenêtre des documents) | `src/features/docs/DocModal/constants.ts` | **auto** : `tests/coherence.test.ts` |
| Chaque fichier de `docs/` est dans la table « Documentation » du README | `README.md` | **auto** : `tests/coherence.test.ts` |
| Chaque fichier de `docs/` est cité dans `CLAUDE.md` | `CLAUDE.md` | **auto** : `tests/coherence.test.ts` |
| Le schéma et les fiches lisent `docs/schema-electronique.md` à la compilation (premier bloc mermaid, section « Paramètres à respecter ») : ne pas renommer ces titres | `src/features/schema/SchemaPanel/constants.ts` | **auto** : `tests/coherence.test.ts` |
| L'explorateur de code ne montre que le dossier `pi/` (sources du Pi, pas `pi/web`) | `src/features/docs/CodeBrowser/constants.ts` | à la main |
| Le document suit le modèle : toute modification du nichoir met à jour `docs/schema-electronique.md` en même temps | voir les sections 1 et 2 | à la main |

## Commandes de vérification (résumé)

| Commande | Ce qu'elle fait |
| --- | --- |
| `npm run check` | tout : tsc, lint, tests avec seuils de couverture, pytest, builds, sous-projets |
| `npm test` / `npm run coverage` | tests racine / avec couverture et seuils |
| `npm run test:py` | pytest du Pi |
| `npm run build:pi` | recompile `pi/web/` |
| `npm --prefix pi/site test` / `npm --prefix laser-control test` | tests des sous-projets |
| `UPDATE_GOLDEN=1 npx vitest run` | régénère les golden (relire le diff, jamais à l'aveugle) |
