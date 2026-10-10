# Nichoir mésange

Un nichoir à mésanges isolé, dessiné en 3D dans le navigateur et découpé au laser dans du contreplaqué de 3 mm, avec son électronique : deux caméras, LED infrarouges, Peltier pour tenir 5 °C d'écart, capteurs, batterie LiFePO4 et panneau solaire, le tout piloté par un Raspberry Pi 5 et visible sur une page web.

**Application en ligne :** https://mathieujullien77190.github.io/birds/ (GitHub Pages, publiée automatiquement à chaque push sur `main`).

## Ce que fait l'application

- Un seul écran : le nichoir en 3D (Three.js), réglable par quelques curseurs (intérieur carré, hauteur et diamètre du trou), avec les options Solaire, 2ᵉ caméra et Peltier + capteur.
- Chaque pièce est une plaque de contreplaqué crénelée : cliquer une pièce dans la 3D la choisit et la montre dans le volet « Pièces » ; survoler un fil ou un composant le met en surbrillance dans le schéma électrique (bouton 🔌 Schéma) et inversement.
- « Découpe laser » : les plaques sont rangées sur des planches de 410 × 400 mm (marge de 8 mm, 5 mm entre pièces) et exportées en SVG, un fichier par planche.
- Deux documents intégrés (pièce « Schéma électronique » du volet « Pièces ») : le **schéma électronique** (branchements fil par fil, paramètres de chaque composant, poids, prix par groupe avec cases à cocher, liens vers les fiches) le **logiciel** (programme Python sur le Pi, service systemd, page web, accès à distance) et un explorateur du **code du Pi** (arborescence du dossier `pi/`, sources colorées).

## Lancer en local

```sh
npm install
npm run dev        # http://localhost:5174
npm run typecheck
npm run build      # dist/
```

## Publier sur GitHub Pages

Le dépôt contient le workflow `.github/workflows/pages.yml` : à chaque push sur `main`, il construit l'application et la publie. Une seule fois, dans les réglages du dépôt sur GitHub : **Settings → Pages → Source : GitHub Actions**. L'adresse est alors `https://<utilisateur>.github.io/<dépôt>/` (les chemins de l'application sont relatifs, `base: './'` dans `vite.config.ts`).

## Dossiers

| Dossier | Rôle |
| --- | --- |
| `src/app/`, `src/features/` | L'application : `features/planks` (vue 3D, interface, historique), `features/schema` (schéma à côté de la 3D), `features/docs` (documents, code), `features/laser` (découpe laser) ; `src/planks/` garde le modèle du nichoir (`model.ts`), la géométrie Three (`three/`) et le simulateur du Pi.
| `src/ui/`, `src/hooks/`, `src/lib/` | Briques d'interface partagées (un dossier par brique), hooks et utilitaires communs. |
| `docs/` | Les documents Markdown affichés dans l'application. |
| `pi/` | Ce qui tourne sur le Raspberry Pi : programme Python (`nichoir.py`), site React + TypeScript (`pi/site/`, projet autonome, compilé dans `pi/web/`) et installation. |
| `public/models/` | Le modèle 3D du Raspberry Pi. |
| `archives/autres-outils/` | Les anciens outils (visionneuse STL, pavé isolé, nichoir complet, menu de départ), gardés pour mémoire, non compilés. |
| `archives/editeur-oiseaux/`, `archives/ancien-monde-lowpoly/` | Projets précédents, lecture seule. |

Le fichier `CLAUDE.md` décrit le modèle en détail (conventions, décisions, historique des choix).
