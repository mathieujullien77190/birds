# Nichoir high tech

Un nichoir à mésanges isolé, dessiné en 3D dans le navigateur et découpé au laser dans du contreplaqué de 3 mm, avec son électronique : deux caméras, LED infrarouges, ventilateur silencieux sur cassette amovible (été / hiver), prise d'air basse, capteurs, batterie LiFePO4 et panneau solaire, le tout piloté par un Raspberry Pi 5 et visible sur une page web.

[Application en ligne](https://mathieujullien77190.github.io/birds/)

## Ce que fait l'application

**Concevoir le nichoir**
- Un nichoir complet généré en 3D (Three.js) à partir de quelques curseurs : taille intérieure, hauteur et diamètre du trou d'envol. Option : 2ᵉ caméra (le panneau solaire est toujours là).
- Montage sans soudure : cordons Dupont, borniers à vis, Wago 221 et prises d'origine ; voir la section « Montage sans soudure » du document « Schéma électronique ».
- Chaque pièce est une plaque de contreplaqué de 3 mm à crans qui s'emboîtent, avec isolant, habillage en lambris, toit, ventilateur amovible avec son conduit de sortie, prise d'air basse et fixation à l'arbre. L'électronique est modélisée aussi (Raspberry Pi, caméras, batterie, régulateur, fils et nappes à leur vraie taille).
- Vue 3D interactive : survol et sélection des pièces, liste « Pièces » (groupes, œil pour cacher, renommer, dupliquer), plan de coupe, tirer une face, trou par clic droit, historique avec « Retour ».
- Mode **jour / nuit** de la scène, et **schéma électronique** à côté de la 3D : survoler un fil ou un composant le met en surbrillance des deux côtés, clic sur un module pour sa fiche.

**Fabriquer**
- **Découpe laser** : toutes les plaques rangées automatiquement sur des planches de 410 × 400 mm, exportées en SVG.
- **Pilotage de la laser** (Sculpfun S30 Pro) depuis le navigateur : connexion USB, déplacements, cadre à vide, génération du G-code, planche d'essai, envoi avec pause et arrêt, et une machine simulée pour essayer sans rien brancher.

**Surveiller et commander le nichoir** (programme sur le Raspberry Pi, site React + TypeScript)
- Température et humidité du nid et de l'extérieur (météo en ligne), température du dissipateur.
- Peltier en froid / chaud / arrêt avec sécurités (coupure à 55 °C, sonde en panne, batterie faible).
- Niveau de la batterie, consommation estimée selon ce qui est allumé et recharge solaire.
- Deux caméras en direct avec LED infrarouges, chacune allumable et éteignable.
- **Simulateur** de ce site dans l'app (bouton « 🐍 Pi ») : le vrai programme Python tourne dans le navigateur, avec un terminal, des flux vidéo pris depuis les caméras de la 3D (noir et blanc infrarouge la nuit) et des essais de pannes.

**Comprendre**
- Documents intégrés (schéma électronique avec poids et prix par groupe, logiciel, laser) et explorateur du code du Pi : voir **Documentation** ci-dessous.

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
| `archives/` | Anciens projets et outils, gardés pour mémoire. |

Le fichier `CLAUDE.md` décrit le modèle en détail (conventions, décisions, historique des choix).
