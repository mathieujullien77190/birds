# Architecture 3D

Comment le code du nichoir est organisé : un **modèle pur** (les plaques, les nombres, la découpe) et une **couche Three.js** (ce qu'on voit et ce qu'on clique). Le modèle ne connaît pas Three.js ; la couche 3D lit le modèle et le dessine.

## Schéma

```
src/birdhouse/
  model.ts                façade : réexporte tout model/ (les scripts l'importent par ce chemin)
  model/                  PUR — aucun import de three
    types.ts constants.ts util.ts persistence.ts
    math/rotation.ts      Euler XYZ en degrés, quaternions, vecteurs (mêmes formules que three.js)
    geometry/             holes, castellation, outline, transform, face, factory
    nest/                 makeBox, makeNest, cameras
    sheets/               rangement et SVG de la découpe laser
  three/                  Three.js
    constants.ts          vue, lumières jour / nuit, repères, prise de vue caméra
    registry/             palette.ts (couleurs nommées), materials.ts (ressources partagées)
    scene/                createScene (scène, caméra, renderer, orbite), renderLoop
    factories/            plank.ts (PlankMesh), part/ (une fabrique par type de pièce), wire, marks, dimension
    interactions/         picking, dragCut, dragFace, hover, click
    dispose.ts            disposeObject3D, clearGroup
    cameraShooter.ts      les prises de vue des caméras du Pi

src/features/viewer/hooks/
  useThreeView            createScene + les contrôleurs d'interaction
  useSceneSync            l'état React -> la scène (7 effets)
  useDayNight, usePiCameraShot
```

Le sens des dépendances : `features/viewer` → `three/` → `model/`. Jamais l'inverse : `model/` ne sait rien de la 3D.

## Ajouter une pièce (un composant électronique, par exemple)

1. **Modèle** : dans `makeNest` (`model/nest/makeNest.ts`), ajouter une plaque avec `special: 'monType'` (ajouter `'monType'` au type `Plank['special']` dans `model/types.ts`), ses dimensions `w`, `h`, éventuellement `depth`, `color`, `path`.
2. **Dessin** : créer `three/factories/part/monType.ts` qui exporte `monTypeGeometry(p: Plank): PartGeometry`. On y assemble des morceaux colorés (`{ g, c }`) et on appelle `coloredPart(parts)` (surface fusionnée + arêtes) ; pour une pièce sans arêtes visibles, `{ geo: mergeColored(parts), edges: emptyEdges() }`. Les couleurs viennent de `registry/palette.ts`.
3. **Branchement** : une ligne dans la table de `three/factories/part/index.ts`.
4. **Références** : ajouter la pièce dans `tests/parts.golden.test.ts` (une entrée) puis régénérer les références (`UPDATE_GOLDEN=1 npx vitest run`) et relire le diff.
5. **Document** : mettre à jour `docs/schema-electronique.md` si la pièce est de l'électronique (règle du projet).

Un type de plaque de bois (contour libre, trous…) n'a pas de `special` : il suit `factories/plank.ts`, qui extrude le contour de `outline(p)` avec ses trous.

## Pièce tournante (rotor du ventilateur)

Une fabrique peut rendre un `rotor` en plus de `geo` / `edges` (`PartGeometry.rotor`) : `PlankMesh` en fait un enfant (`mesh.rotor`, typé, même matériau que la pièce, arêtes en enfant), libéré avec elle. Le ventilateur (`part/fan.ts`) sépare ainsi le cadre (statique) et le rotor (9 pales + moyeu) ; à l'arrêt, cadre + rotor redonnent exactement l'ancien dessin d'un seul bloc (testé par empreinte). `three/fanSpin.ts` : `advanceAngle(angle, pct, dt)` (vitesse = pct / 100 × 3 tours/s au plus) et `spinRotors(view, dt)`, appelée à chaque image par la boucle de rendu de `createScene` (pas de temps plafonné à 0,1 s, la boucle ne tourne pas quand la page est cachée). `view.fan = { pct, angle }` est alimenté par le hook `useFanSpeed(view, pct)` ; le simulateur du Pi donne `pct` par sa prop `onFanSpeed` (chaque seconde ; 0 si le ventilateur est éteint ou coupé, et à la fermeture).
## Faisceaux infrarouges (LED allumées dans le simulateur du Pi)

`three/irBeam.ts` : `IrBeams` (un par vue, `view.ir`) dessine, pour chacune des deux cartes de LED (« LED infrarouges » dans le nid, « LED infrarouges extérieures »), un cône translucide rose-rouge (demi-angle 35°, 180 mm pour le nid, 250 mm dehors, additif, dégradé vers le bout), une lueur sur la carte et un projecteur (`SpotLight`, même axe) qui éclaire vraiment les surfaces. L'axe est l'axe d'objectif de la carte (−z local tourné par la mesh) ; le fondu dure 150 ms ; de jour l'intensité est × 0,5. Les projecteurs restent dans la scène à intensité 0 quand les LED sont éteintes (retirer une lumière fait recompiler les matériaux). Rien ne se sélectionne ni ne se survole (pas de `raycast`) ; `CameraShooter` appelle `beams.suspend()` pendant une prise de vue (la lampe infrarouge du flux vidéo simule déjà cet éclairage). Le simulateur du Pi donne `etat.led_nid` / `led_ext` par sa prop `onLeds` (chaque seconde, éteintes à la fermeture) ; le hook `useIrBeams(view, sc, leds)` lie les cartes (après `useSceneSync`) et allume les faisceaux ; `useDayNight` règle le jour / la nuit.
## Ce qui refait la géométrie d'une plaque

`plankShapeKey` (dans `factories/plank.ts`) liste tout ce qui change le dessin : dimensions, crans, trous, épaisseur, chemin, profondeur, couleur, contour libre, haut incliné, type spécial. La mesh (`PlankMesh`) ne refait sa géométrie que si cette clé change. **Si une pièce dépend d'une nouvelle propriété de `Plank` pour son dessin, l'ajouter à la clé** (sinon le dessin reste périmé).

## Libération des ressources

- Toute géométrie, tout matériau ou toute texture créé pour UNE pièce ou UN repère est libéré par `disposeObject3D` (`dispose.ts`). `useSceneSync` l'appelle à la suppression d'une plaque ; `clearGroup` vide un groupe de repères.
- Les ressources **partagées** (le matériau des arêtes, ceux des repères et des cotes, la texture de chêne) viennent du registre (`registry/materials.ts`), créées à la demande. **Elles ne sont jamais libérées avec une pièce** (`isShared` les reconnaît) : seulement par `disposeAll()`, appelé à la fermeture de la vue (`createScene().dispose()`).
- Un matériau ou une texture partagés = un accesseur `lazy(...)` dans le registre, pas un `new` au niveau du module.
- `createScene().dispose()` arrête la boucle, retire les écouteurs (les contrôleurs d'`interactions/` renvoient chacun leur désinscription), libère les meshes, les repères, le registre, les contrôles et le renderer.

## Tests

- `npm test` (vitest). Les tests « golden » comparent à `tests/golden/*.json` : le modèle (`makeNest` et ses variantes), les empreintes des géométries (chaque plaque, chaque type de pièce) et les fonctions pures (`outline`, `bounds`, `pullFace`…). Une différence veut dire que le modèle ou le rendu a changé : si c'est voulu, régénérer avec `UPDATE_GOLDEN=1 npx vitest run` et relire le diff.
- `tests/rotation.equivalence.test.ts` prouve que les rotations maison donnent les mêmes nombres que three.js (à 1e-9 près, sur 2500 entrées aléatoires).
- `npm run lint` : ESLint, outils dans `tools/lint/` (à installer une fois : `npm --prefix tools/lint install`).
- `tests/geomChecks.ts` : boîtes orientées (`obb`, `overlap`, `aabb`, `gap`), courbes réelles des fils (`pathItems`, `pathContacts`, mêmes arcs que la 3D) et sommets des nappes (`ribbonPoints`) ; `tests/ventilation.test.ts` s'en sert pour contrôler le ventilateur (cassette, siège, fils sans croisement), le bloc d'hiver et la prise d'air basse. Les pièces posées dans une encoche ou un trou du modèle (parois qui traversent le dessus du toit, conduit dans le fond intérieur) se recoupent en rectangle : c'est voulu et connu des tests.
