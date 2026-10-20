# pi/ — ce qui tourne sur le Raspberry

- `nichoir/` : le programme, un dossier de chapitres (config, state, hardware, power, simulation, commands, settings, history, alerts, auto, probe, reading, web, startup) exécutés dans UN SEUL espace de noms par `__init__.py` (l'ordre de `CHAPTERS` compte). Flask port 8080 ; lancer : `python -m nichoir` ; `NICHOIR_MOCK=1` = mode simulé. Chaque fichier est commenté ligne par ligne.
- `site/` : projet autonome React + TS, compilé dans `web/` (**committé**). Après changement : `npm run build:pi` à la racine puis commit de `pi/web/`.
- `serveur/` : `nichoir-nginx.conf`, le relais nginx du Pi serveur qui héberge `web/` et renvoie `/api/` et `/video/` vers le Pi du nichoir (voir `README.md`). Une nouvelle route du site doit être couverte par ces deux préfixes (testé).
- `tests/` : pytest, couverture 100 % exigée (`.coveragerc`).
- Changer une route, une clé de `state` ou un réglage auto : le chapitre concerné de `nichoir/`, `site/src/api/index.ts`, `DeviceState`, `AUTO_FIELDS`, `src/birdhouse/PiSimulator.tsx` (`BOOT`, `PI_TESTS`), `docs/logiciel.md`. Skill : `pi-program`.
