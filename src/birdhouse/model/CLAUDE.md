# model/ — modèle pur du nichoir

**Aucun import three.js ici** (ni dans `../model.ts`). Rotations par `math/rotation.ts` (Euler XYZ en degrés).
- `nest/makeNest.ts` : génère toutes les pièces (groupes Corps, Toit, Électronique, Habillage, Couvercle, Ventilation…). Grosse fonction, déplacée telle quelle.
- `nest/winter.ts` : cassette ventilateur / isolante / aucune, prise d'air.
- `geometry/` : trous, crénelage (crans resserrés de `CRENEL_SNUG` = -0,2 mm : les plaques tiennent seules, voir `docs/laser.md`), contours, transformations, tirage de face.
- `sheets/` : découpe laser (`nestSheets`), SVG, codes de plaques (`partCodes.ts`).
- `assembly/` : mode Montage (`data.ts` = règles). Toute nouvelle pièce doit être dans une étape.
- `wires/` : `wireInfo.ts` (table `TABLE` : un fil sans ligne fait échouer `tests/wireInfo.test.ts`).
- `constants.ts` : `STRIP`, `THIN`, `OKOUME_T`, `DEFAULT_SHEET`…

Changer une pièce : fabrique 3D (`../three/factories/part/`), `LINKS`, `VENT_PIECES`, `HIDDEN_AT_CREATION`, golden (`UPDATE_GOLDEN=1 npx vitest run`, relire le diff), `docs/schema-electronique.md`, `MAP` / `FICHES` du schéma. Skill : `nichoir-piece`.
