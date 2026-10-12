# pi/ — ce qui tourne sur le Raspberry

- `nichoir.py` : Flask port 8080, capteurs, caméras, ventilateur, mode auto. `NICHOIR_MOCK=1` = mode simulé.
- `site/` : projet autonome React + TS, compilé dans `web/` (**committé**). Après changement : `npm run build:pi` à la racine puis commit de `pi/web/`.
- `tests/` : pytest, couverture 100 % exigée (`.coveragerc`).
- Changer une route, une clé de `etat` ou un réglage auto : `nichoir.py`, `site/src/api/index.ts`, `DeviceState`, `AUTO_FIELDS`, `src/birdhouse/PiSimulator.tsx` (`BOOT`, `PI_TESTS`), `docs/logiciel.md`. Skill : `pi-program`.
