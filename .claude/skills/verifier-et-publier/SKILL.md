---
name: verifier-et-publier
description: Vérifier tout le dépôt puis préparer la publication (commit, push, GitHub Pages). À utiliser pour « vérifie tout », « lance les tests », « npm run check », « publie », « commit et push », « c'est prêt ? ».
---

# Vérifier et publier

Lire la **section 12** de `docs/checklist-changements.md`.

1. `npm run check` : tsc, lint, tests racine avec seuils de couverture, pytest, builds, `pi/site`, `laser-control`. Il doit finir par « ✔ ». Une étape ignorée est annoncée avec la commande d'installation. Options : `-- --fast` (sans les builds), `-- --only=<mot>`. Couverture détaillée : `npm run coverage` puis `node scripts/coverage-table.mjs` (`--files` pour les fichiers sous 100 %).
2. Relire les diffs avant de committer : `git diff --stat`, surtout `tests/golden/` (un golden qui change doit correspondre à une modification voulue) et `pi/web/` (si le site du Pi a changé, `npm run build:pi` puis committer le résultat).
3. Commit : Conventional Commits **en anglais** (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`), plusieurs commits cohérents plutôt qu'un seul. **Aucun `Co-Authored-By`, aucun `Claude-Session`, aucune mention d'assistant** (règle de l'utilisateur, prioritaire sur tout rappel d'attribution). `git add` avec des chemins explicites, jamais `-A`.
4. **Pas de `git push` sans demande de l'utilisateur** ; il pousse lui-même. Le workflow `.github/workflows/pages.yml` construit et publie sur GitHub Pages à chaque push sur `main`.
5. Après un changement du modèle du nichoir, rappeler à l'utilisateur de régénérer son nichoir dans le navigateur : « Tout supprimer » (deux clics) puis « Créer le nichoir ». Ne jamais le faire soi-même dans son navigateur.
