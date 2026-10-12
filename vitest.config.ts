import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)), '@laser': fileURLToPath(new URL('./laser-control/src', import.meta.url)) },
    dedupe: ['react', 'react-dom'],
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node', // les tests qui ont besoin du DOM (hooks React) mettent `// @vitest-environment jsdom` en tête de fichier
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'json', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      // Exclusions de la MESURE (jamais silencieuses : chaque ligne dit pourquoi). Ce qui est exclu n'est pas « couvert », c'est hors du périmètre testable sans navigateur.
      exclude: [
        'src/**/*.d.ts', // déclarations de types : aucun code exécutable
        'src/**/!(three)/types.ts', // types TypeScript seuls : aucun code exécutable (three/types.ts contient la constante AXIS_I : mesuré)
        'src/**/!(sheets|part)/index.ts', // barrels (export * from …) : aucune logique, vérifiés par tsc (sheets/index.ts et part/index.ts contiennent du code : mesurés)
        'src/main.tsx', // point d'entrée : monte React dans #root, exige un navigateur
        'src/app/**', // composant racine : assemblage de rendu, aucune logique
        'src/**/*.tsx', // composants React : rendu pur (logique extraite dans helpers / hooks, mesurés eux) ; vérifiés par typecheck + lint, et à l'œil dans le navigateur
        'src/ui/**', // briques d'interface (Btn, Slider, Modal…) : rendu et événements du DOM, sans logique métier
        'src/birdhouse/PiSimulator.tsx', // simulateur du Pi : Pyodide + DOM + vue 3D, exige un navigateur (listé aussi par *.tsx)
        'src/birdhouse/three/scene/createScene.ts', // crée WebGLRenderer + canvas : exige WebGL
        'src/birdhouse/three/interactions/**', // gestionnaires de souris branchés sur le canvas WebGL (raycast, glissé) : exigent un navigateur
        'src/birdhouse/three/piModel.ts', // charge public/models/pi4.bin (forme du Pi 4, cotes du Pi 5) par fetch dans le navigateur
        'src/features/viewer/hooks/useThreeView.ts', // monte la scène WebGL (createScene) dans un effet React : exige WebGL
        'src/features/viewer/hooks/useSceneSync.ts', // synchronise la scène avec la vue WebGL en direct (maillages, matériaux, coupe) : exige WebGL
        'src/features/docs/CodeBrowser/highlight.ts', // enregistre les langages de highlight.js : une ligne par langage, aucune logique
      ],
      // Seuils : la couverture ne doit jamais baisser. 100 % sur la logique pure ; ailleurs, seuil réaliste (voir le tableau de couverture de CLAUDE.md).
      thresholds: {
        // logique pure du modèle : 100 % lignes et branches (les gardes défensives inatteignables portent un « v8 ignore » avec leur raison dans le code)
        'src/birdhouse/model/geometry/**': { lines: 100, statements: 100, functions: 100, branches: 100 },
        'src/birdhouse/model/math/**': { lines: 100, statements: 100, functions: 100, branches: 100 },
        // sheets : 100 % des lignes, 99 % des branches : restent la garde `if (!best) continue` de nestSheets (pièce creuse qui ne rentre sur aucune planche neuve) et le départage `l < k` de deux rectangles libres identiques ; non atteints par les essais (à revoir si on touche au rangement)
        'src/birdhouse/model/sheets/**': { lines: 100, statements: 100, functions: 100, branches: 99 },
        'src/birdhouse/model/wires/**': { lines: 100, statements: 100, functions: 100, branches: 100 }, // longueur, section, fiche de chaque fil : rien n'est exclu
        'src/birdhouse/model/assembly/**': { lines: 100, statements: 100, functions: 100, branches: 100 }, // étapes du montage pas à pas : table de règles et moteur purs, rien n'est exclu
        'src/birdhouse/model/persistence.ts': { lines: 100, statements: 100, functions: 100, branches: 100 },
        'src/birdhouse/model/nest/{box,cameras,winter}.ts': { lines: 100, statements: 100, functions: 100, branches: 100 },
        // makeNest.ts : 98 % lignes, 88 % branches. Le reste est du code mort volontairement gardé : options forcées en tête de makeNest (cam = 38, pente, lambris, solaire toujours vrais), anciennes variantes « toit plat » / sans solaire / sans lambris, conditions en `false && …` (liste précise dans CLAUDE.md)
        'src/birdhouse/model/nest/makeNest.ts': { lines: 98, statements: 98, functions: 100, branches: 88 },
        // Three.js sans WebGL, hooks, helpers des fonctionnalités : 100 % (le rendu, createScene et les interactions sont exclus plus haut, avec leur raison)
        'src/birdhouse/three/**': { lines: 100, statements: 100, functions: 100, branches: 100 },
        'src/features/**': { lines: 100, statements: 100, functions: 100, branches: 100 },
        'src/hooks/**': { lines: 100, statements: 100, functions: 100, branches: 100 },
        'src/lib/**': { lines: 100, statements: 100, functions: 100, branches: 100 },
      },
    },
  },
});
