# laser-control/ — pilotage Sculpfun S30 Ultra 22 W

Projet **autonome** (GRBL 1.1, Web Serial) : aucun import hors du dossier, imports relatifs (jamais `@/`). Source de vérité du pilotage ; l'app l'importe par `@laser` via `src/features/laser/adapter.ts`.
- `src/grbl/` (logique pure), `src/job/` (G-code, import SVG), `src/ui/` (copie des briques de `src/ui/`, à garder d'accord).
- Sécurités : plafond de puissance, cadre à vide sans laser, confirmation avant coupe.
- Tests : `npm test` ici. Doc : `docs/laser.md`. Skill : `laser-control`.
