---
name: regles-du-projet
description: Rappel des règles et pièges du projet Nichoir high tech avant toute modification (langue, conventions de code, jeu fit, localStorage partagé, tests dans le navigateur, golden). À consulter au début d'un travail sur le dépôt, ou avant de tester dans le navigateur.
---

# Règles du projet

La mémoire détaillée est `CLAUDE.md` (longue : la lire par sections) ; la liste « quand je change X » est `docs/checklist-changements.md`.

**Langue et style**
- UI, commentaires et documents en **français** ; code (noms, fonctions, types) en **anglais**.
- TypeScript strict, **pas de `any`** (ESLint `no-explicit-any`). Un dossier par composant avec son `index.ts` ; la logique dans des `helpers.ts` ou des hooks (c'est ce qui se teste).
- `fit` (jeu des fentes) = **0**. Positions gardées au centième (`r2`), jamais arrondies au millimètre.
- Remplacements ciblés dans `CLAUDE.md`, jamais une réécriture ; ne pas supprimer l'historique des choix.

**Git**
- Commits en anglais, Conventional Commits, **sans `Co-Authored-By`, sans `Claude-Session`, sans mention d'assistant** ; `git add` par chemins ; pas de push sans demande.

**Navigateur de l'utilisateur**
- **Ne jamais cliquer « Tout supprimer »** ni vider le `localStorage` : il est **partagé entre tous les onglets** de la même origine et contient son nichoir, son historique et ses réglages.
- Tester sur l'origine `http://[::1]:5174` (pas `localhost`) pour ne pas toucher à ses données.
- Un onglet **masqué** ne rend plus : la vue 3D reste figée (le rendu est suspendu) ; amener l'onglet au premier plan avant de juger.
- **Clés `localStorage` (`STORAGE`)** : ne jamais les renommer sans migration (test de valeurs figées dans `tests/coherence.test.ts`).

**Tests**
- `UPDATE_GOLDEN=1 npx vitest run` régénère les golden : **relire le diff** avant de committer ; ne jamais régénérer pour faire passer un test.
- Chaque test doit pouvoir échouer si le code est cassé. Une exclusion de couverture s'écrit avec sa raison dans `vitest.config.ts`.
- Tout vérifier : `npm run check`.
