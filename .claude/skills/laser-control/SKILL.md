---
name: laser-control
description: Modifier le pilotage de la laser (GRBL, G-code, import SVG, planche d'essai, machine simulée) dans laser-control/, ou son branchement dans l'app (adaptateur @laser). À utiliser pour « la laser », « GRBL », « G-code », « cadre à vide », « Sculpfun », « export de laser-control ».
---

# Changer le pilotage de la laser

Lire la **section 6** de `docs/checklist-changements.md`.

1. `laser-control/` est la **source de vérité** et un projet autonome (son propre `package.json`, `node_modules`, tests). Y faire le changement : `laser-control/src/grbl/` (client, flux, état), `laser-control/src/job/` (G-code, SVG, import), `laser-control/src/components/`.
2. Tests : `npm --prefix laser-control test` ; couverture à 100 % sur la logique (`npm --prefix laser-control run coverage`), les composants React sont exclus avec une raison écrite dans `laser-control/vitest.config.ts`.
3. Les briques `src/ui/`, `src/hooks/`, `src/lib/` de `laser-control/` sont **des copies** de celles de `src/` : modifier les deux (`tests/coherence.test.ts` détecte une divergence).
4. Si le format `LaserJob` / `LaserItem` change : `src/features/laser/adapter.ts` et `tests/laserAdapter.test.ts`.
5. Documents : `docs/laser.md` (mode d'emploi, identique dans les deux projets), `laser-control/README.md`, `CLAUDE.md` (ciblé).
6. L'export autonome doit rester possible : `npm --prefix laser-control run export -- <dossier-vide>`.
7. `npm run check`.

Sécurité : rien n'est envoyé à la connexion ; la découpe exige la liste de sécurité cochée ; « Arrêt » = `!`, `0x18`, `M5`. Ne jamais affaiblir ces garde-fous sans demande explicite.
