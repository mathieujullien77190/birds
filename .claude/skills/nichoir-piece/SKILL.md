---
name: nichoir-piece
description: Ajouter, modifier, déplacer ou retirer une pièce du nichoir (plaque, composant électronique, fil, nappe, pavé, groupe) dans makeNest. À utiliser pour « ajoute / change / retire une pièce », « un fil », « un composant », « le ventilateur », « la batterie », « les barres », « le Wago », une taille ou une position qui change dans le modèle 3D.
---

# Changer une pièce du nichoir

La liste complète et à jour est la **section 1 (et 2 pour un fil)** de `docs/checklist-changements.md` : la lire d'abord, ne pas la recopier ici.

Étapes, dans l'ordre :

1. Lire la pièce voisine dans `src/birdhouse/model/nest/makeNest.ts` (noms, groupes, `special`, `LINKS`, `VENT_PIECES`) et copier son style.
2. Modifier `makeNest.ts`. Nouveau type `special` : l'ajouter à `Plank['special']` (`model/types.ts`), créer sa fabrique dans `src/birdhouse/three/factories/part/` et une ligne dans `part/index.ts`. Une nouvelle propriété qui change le dessin va dans `plankShapeKey` (`factories/plank.ts`).
3. Si la pièce est de l'électronique : mettre à jour `docs/schema-electronique.md` (schéma mermaid, **liste `linkStyle` dans l'ordre des flèches**, `classDef`, branchements, fiche `###`, poids, prix avec lien vérifié) et `src/features/schema/SchemaPanel/constants.ts` (`MAP`, `FICHES`).
4. Lancer `npx vitest run`. Les golden (`tests/golden/`) changent : **relire le diff** (`git diff --stat tests/golden`), puis seulement `UPDATE_GOLDEN=1 npx vitest run`. Ne jamais régénérer à l'aveugle.
5. `tests/coherence.test.ts` signale un oubli (nom de `VENT_PIECES` sans pièce, fil sans ligne dans `MAP`, `special` sans fabrique, motif de `LINKS` mort). `tests/wiresSolid.test.ts` et `tests/ventilation.test.ts` vérifient qu'aucun fil ne traverse une pièce.
5 bis. **Montage pas à pas** : toute pièce ajoutée, renommée ou retirée se déclare dans la table `SEQ` de `src/birdhouse/model/assembly/data.ts` (une étape par pièce, au bon endroit de l'ordre : isolant avant ce qu'il recouvre, finition avant collage) ; `tests/assembly.test.ts` échoue sinon (bloc « Autres pièces »).
6. Mettre à jour `CLAUDE.md` par remplacement ciblé (jamais une réécriture) et `README.md` si c'est visible.
7. Finir par `npm run check` (skill `verifier-et-publier`).

Rappels : le jeu `fit` vaut 0 ; pièces en MDF = `material: 'mdf'` ; une pièce cachée à la création se déclare dans `HIDDEN_AT_CREATION` (`src/features/viewer/constants.ts`). Après la publication, l'utilisateur régénère son nichoir dans le navigateur (« Tout supprimer » puis « Créer le nichoir ») : le dire dans le compte rendu, ne pas le faire.
