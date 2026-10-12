# Site web du Raspberry Pi (React + TypeScript)

Projet **autonome**, séparé de l'app de conception (`src/` à la racine) : son propre `package.json`, `tsconfig.json`, `vite.config.ts` et `node_modules`. Aucun import entre les deux ; seul l'app lit la sortie compilée `../web/` (simulateur « 🐍 Pi »).

`pi/` = ce qui tourne sur le Raspberry (Python + ce site) ; `src/` = l'app de conception et de simulation.

## Commandes (depuis `pi/site/`)
```sh
npm install
npm run dev        # http://localhost:5175, l'API est relayée vers le Python (NICHOIR_MOCK=1 python nichoir.py, port 8080)
npm run typecheck
npm run build      # écrit ../web/index.html, app.js, app.css
```
Raccourci à la racine du dépôt : `npm run build:pi`.

**La sortie `../web/` est committée** : le Pi n'a pas Node, Flask la sert telle quelle. La compilation donne un script classique (`app.js`, iife, sans hachage) et `app.css`, en chemins relatifs.

## Structure (`src/`, alias `@/`)
- `ui/` : briques génériques répétées (`Banner`, `Card`, `ErrorLine`, `Gauge`, `Stat`, `ToggleButton`).
- `components/` : composants métier qui assemblent ces briques (`App`, `Header`, `NestCard` (avec l'écart avec dehors), `OutsideCard` (« Dehors (sonde) » : température de la sonde DS18B20, écart nid / dehors, état de la sonde), `FanCard` (vitesse, tr/min, Arrêt / Marche, curseur 30-100 %) qui contient `AutoFan` (ventilation automatique : bouton, état, avertissements, réglages), `HistoryChart` (graphique SVG des 24 h : nid, dehors, vitesse du ventilateur en fond), `BatteryCard` (jauge verte > 50 %, orange 20-50 %, rouge < 20 %, tension, Wh restants sur 76,8, solaire), `ConsumptionCard` (total en W, une barre par élément, autonomie estimée), `CameraCard`).
- `api/` client typé de l'API Flask ; `hooks/` (`useDeviceState` : relecture de l'état et de l'historique toutes les 5 s, et commandes) ; `types/` (`DeviceState`, miroir de `etat` en Python ; `HistoryPoint`) ; `constants/` ; `utils/`.

Convention : un dossier par composant (ui ou métier) avec `<Nom>.tsx`, `index.ts`, et seulement au besoin `helpers.ts`, `constants.ts`, `types.ts`, `use<Truc>.ts`, `<Nom>.css`.

Le simulateur de l'app (`src/birdhouse/PiSimulator.tsx`) repère les images par `img.cam` et les boutons par leurs `id` (`c_1`, `c_2`, `l_nid`, `l_ext`) ; les nouveaux boutons ont aussi des `id` stables : `v_arret`, `v_marche`, `v_auto`, `auto_hiver`, `auto_appliquer`, `auto_<réglage>` : à conserver.
