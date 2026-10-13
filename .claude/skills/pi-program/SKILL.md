---
name: pi-program
description: Modifier le programme du Raspberry Pi (pi/nichoir/), le site du Pi (pi/site, React), le simulateur « 🐍 Pi » de l'app, une route de l'API, un réglage du mode automatique ou une sécurité. À utiliser pour « change la ventilation », « ajoute une route », « un nouveau réglage auto », « le site du Pi », « etat », « PiSimulator ».
---

# Changer le Pi, son site ou son simulateur

Lire les **sections 3, 4 et 5** de `docs/checklist-changements.md` (programme, route, réglage auto) : c'est la source de vérité.

Étapes :

1. `pi/nichoir/` (un chapitre par sujet) : le changement + ses constantes (`AUTO_DEFAULTS` et `AUTO_LIMITS` ont les mêmes clés ; `MOCK_*` pour le mode simulé `NICHOIR_MOCK=1`).
2. Tests Python dans `pi/tests/` (couverture 100 % ligne et branche exigée par `pi/.coveragerc`). Python : `python -m pytest pi/tests` (ou `npm run test:py`) ; si `python` est le raccourci du Store, utiliser le venv indiqué par `NICHOIR_PYTHON` (voir `scripts/check.mjs`). `pi/tests/test_coherence.py` compare les clés de `/api/etat` au type `DeviceState` et les routes à `pi/site/src/api/index.ts`.
3. Site : `pi/site/src/types/device.ts` (miroir de `state`), `api/index.ts`, `hooks/`, `components/` (un dossier par composant), `AUTO_FIELDS` dans `components/AutoFan/constants.ts` ; tests dans `pi/site/tests/` (`npm --prefix pi/site test`).
4. **Recompiler et committer `pi/web/`** : `npm run build:pi`. `npm run check` avertit si `pi/web` diffère.
5. Simulateur : `src/birdhouse/PiSimulator.tsx` (`BOOT` = doublure de Flask, `api()`, `PI_TESTS`, type `PiState`). Rien ne le teste : le vérifier dans le navigateur (bouton « 🐍 Pi », menu « 🧪 Tests »).
6. Documents : `docs/logiciel.md`, `pi/README.md`, `CLAUDE.md` (remplacement ciblé). Si un fil ou une broche change : skill `nichoir-piece` (section 2).
7. `npm run check`.

Rappels : chaque matériel du Pi reste facultatif (une erreur s'affiche, le reste tourne) ; le ventilateur n'est jamais coupé par le délestage de batterie ; ne pas toucher à `reglages.json` ni `historique*.json` du dossier pi (ignorés par git).
