# three/ — rendu Three.js

- `scene/createScene` : scène, caméra, renderer, boucle de rendu.
- `factories/` : `plank.ts` (`PlankMesh`), `part/` = un fichier par `special`, `marks.ts`, `dimension.ts`.
- `interactions/` : picking, survol, clic, glissés (chacun renvoie sa désinscription).
- `registry/` : palette, matériaux et textures PARTAGÉS.
- `dispose.ts` : `disposeObject3D` libère toute ressource créée par une pièce.

**Règle GPU** : une ressource du registre n'est JAMAIS libérée avec une pièce, seulement par `disposeAll()`.
Couleur / constante 3D changée → `registry/palette.ts`, `constants.ts`, golden de géométrie. Détails : `docs/architecture-3d.md`.
