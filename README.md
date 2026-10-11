# Nichoir mésange

Un nichoir à mésanges isolé, dessiné en 3D dans le navigateur et découpé au laser dans du contreplaqué de 3 mm, avec son électronique : deux caméras, LED infrarouges, Peltier pour tenir 5 °C d'écart, capteurs, batterie LiFePO4 et panneau solaire, le tout piloté par un Raspberry Pi 5 et visible sur une page web.

**Application en ligne :** https://mathieujullien77190.github.io/birds/ (GitHub Pages, publiée automatiquement à chaque push sur `main`).

## Ce que fait l'application

- Un seul écran : le nichoir en 3D (Three.js), réglable par quelques curseurs (intérieur carré, hauteur et diamètre du trou), avec les options Solaire, 2ᵉ caméra et Peltier + capteur.
- Chaque pièce est une plaque de contreplaqué crénelée : cliquer une pièce dans la 3D la choisit et la montre dans le volet « Pièces » ; survoler un fil ou un composant le met en surbrillance dans le schéma électrique (bouton 🔌 Schéma) et inversement.
- « Découpe laser » : les plaques sont rangées sur des planches de 410 × 400 mm (marge de 8 mm, 5 mm entre pièces) et exportées en SVG, un fichier par planche.
- Trois documents intégrés (pièce « Schéma électronique » du volet « Pièces ») : voir la section **Documentation** ci-dessous. L'app contient aussi un explorateur du **code du Pi** (arborescence du dossier `pi/`, sources colorées), un **simulateur de la page web du Pi** (bouton « 🐍 Pi » : le vrai programme Python tourne dans le navigateur, avec terminal, flux vidéo pris depuis les caméras de la 3D, essais de pannes, jour / nuit) et le **pilotage de la laser** (section « Découpe laser »).

## Documentation

Trois documents Markdown dans [`docs/`](docs/), lisibles aussi dans l'application (pièce « Schéma électronique » du volet « Pièces ») :

| Document | Contenu |
| --- | --- |
| [`docs/schema-electronique.md`](docs/schema-electronique.md) | **Schéma électronique** : schéma général (branchements fil par fil, broches du Raspberry Pi), paramètres à respecter pour chaque composant, vérification des branchements, poids, prix par groupe (cases à cocher dans l'app), stratégie d'énergie. |
| [`docs/logiciel.md`](docs/logiciel.md) | **Logiciel** : programme Python sur le Pi (capteurs, Peltier, LED, caméras), sécurités (coupure à 55 °C, batterie faible), météo extérieure, niveau de batterie et consommation, page web React, simulateur et essais, service systemd, accès à distance. |
| [`docs/laser.md`](docs/laser.md) | **Pilotage de la laser** (Sculpfun S30 Pro, GRBL) : branchement USB, mise en place pas à pas, cadre à vide, réglages de coupe à calibrer, sécurité, convention d'axes. |

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
| `src/app/`, `src/features/` | L'application : `features/viewer` (vue 3D, interface, historique), `features/schema` (schéma à côté de la 3D), `features/docs` (documents, code), `features/laser` (découpe laser) ; `src/birdhouse/` garde le modèle du nichoir (`model.ts`), la géométrie Three (`three/`) et le simulateur du Pi.
| `src/ui/`, `src/hooks/`, `src/lib/` | Briques d'interface partagées (un dossier par brique), hooks et utilitaires communs. |
| `docs/` | Les documents Markdown affichés dans l'application. |
| `pi/` | Ce qui tourne sur le Raspberry Pi : programme Python (`nichoir.py`), site React + TypeScript (`pi/site/`, projet autonome, compilé dans `pi/web/`) et installation. |
| `public/models/` | Le modèle 3D du Raspberry Pi. |
| `archives/autres-outils/` | Les anciens outils (visionneuse STL, pavé isolé, nichoir complet, menu de départ), gardés pour mémoire, non compilés. |
| `archives/editeur-oiseaux/`, `archives/ancien-monde-lowpoly/` | Projets précédents, lecture seule. |

Le fichier `CLAUDE.md` décrit le modèle en détail (conventions, décisions, historique des choix).
