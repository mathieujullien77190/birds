# Nichoir high tech

Un seul outil : le nichoir high tech (« Plaques », `src/birdhouse/`). `src/main.tsx` rend `Planks`. Les anciens outils sont dans `archives/` (lecture seule, non compilés).
Langue : français (UI, commentaires, docs), code en anglais. Commits : Conventional Commits en anglais, faits par l'utilisateur.
Publication : GitHub Pages via `.github/workflows/pages.yml` (push sur `main`).

## Stack
Vite + React 19 + TypeScript + Tailwind v4 + Three.js. Alias `@/` → `src/`, `@laser` → `laser-control/src`.

## Dossiers
| Dossier | Rôle |
|---|---|
| `src/birdhouse/model/` | Modèle pur (aucun import three.js). `makeNest` = le nichoir, `model.ts` = barrel |
| `src/birdhouse/three/` | Rendu Three.js (scène, fabriques de pièces, interactions) |
| `src/features/viewer/` | Écran `Planks`, composants, hooks |
| `src/features/laser/` | Adaptateur vers `laser-control/` (pilotage Sculpfun S30 Ultra 22 W) |
| `src/features/docs/`, `schema/` | Documents, schéma mermaid, code |
| `src/ui/`, `hooks/`, `lib/` | Briques UI et utilitaires sans logique métier |
| `pi/` | Programme du Raspberry (`nichoir.py`) et site `pi/site/` (compilé dans `pi/web/`, committé) |
| `laser-control/` | Projet autonome de pilotage laser |
| `docs/` | `docs/schema-electronique.md` (dossier du nichoir), `docs/logiciel.md`, `docs/laser.md`, `docs/architecture-3d.md`, `docs/checklist-changements.md` |
| `tests/` | vitest, goldens dans `tests/golden/` |

## Règles
- Le document `docs/schema-electronique.md` suit le modèle : toute pièce, fil, prix ou poids modifié = document mis à jour.
- Une nouvelle pièce doit apparaître dans une étape du mode Montage (`src/birdhouse/model/assembly/`).
- Un nouveau fil de `makeNest` a sa ligne dans `TABLE` de `wireInfo`.
- Schéma mermaid : si une flèche change, refaire les `linkStyle` dans l'ordre.
- Pas de `any`. `fit` = 0. Ne jamais « Tout supprimer » dans le navigateur de l'utilisateur (localStorage partagé).
- Goldens : `UPDATE_GOLDEN=1 npx vitest run`, puis relire le diff des JSON.
- Après un changement du programme du Pi : `npm run build:pi` et commit de `pi/web/`.
- Des `CLAUDE.md` par dossier détaillent `src/birdhouse/model/`, `src/birdhouse/three/`, `src/features/viewer/`, `pi/`, `laser-control/`.
- Liste complète « je change X → je mets à jour Y » : `docs/checklist-changements.md`. Skills du projet : `.claude/skills/`.

## Commandes
```sh
npm run dev        # http://localhost:5174
npm test           # vitest
npm run lint
npm run test:py    # pytest du Pi
npm run check      # tout : tsc, lint, tests + couverture, pytest, builds
npm run build
```
