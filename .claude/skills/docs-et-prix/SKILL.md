---
name: docs-et-prix
description: Modifier les documents du projet (docs/*.md), le tableau des prix et des poids, les liens d'achat, le schéma mermaid, les fiches de composants ou la section « Montage sans soudure ». À utiliser pour « change un prix », « ajoute un lien », « mets à jour le schéma », « la liste de courses », « un nouveau document ».
---

# Documents, prix, liens, schéma

Lire les **sections 7 et 14** de `docs/checklist-changements.md`.

- **Prix** : tableau `| Groupe | Élément | Prix | Modèle exact / lien | Vérifié |` dans `docs/schema-electronique.md`. 5 colonnes exactement ; la 5ᵉ = `[ ]` / `[x]` (« lien vérifié à la main » ; en `npm run dev` la case de l'app réécrit cette cellule par `applyVerified`, `src/features/docs/DocModal/verified.ts` ; ne jamais mettre `[x]` sans avoir ouvert le lien ; une ligne nouvelle commence à `[ ]`) ; la 4ᵉ = un lien https **vérifié en ouvrant la page**, ou `lien à trouver — référence exacte : …`, ou `fabriqué` / `incluse`. `tests/docLinks.test.ts` refuse le format cassé et les liens morts connus ; il ne détecte pas un lien qui pointe vers un autre produit. Le tableau devient interactif par `enhancePrices` (`src/features/docs/DocModal/helpers.ts`, testé par `tests/docModal.test.ts`). Mettre aussi à jour le total cité dans le texte.
- **Lien dans « Pièces »** : tableau `LINKS` de `src/birdhouse/model/nest/makeNest.ts` (`tests/coherence.test.ts` vérifie que chaque motif correspond à une pièce).
- **Schéma mermaid** : un seul bloc ```mermaid (le premier est lu à la compilation). Si on ajoute ou retire une flèche : refaire **toute** la liste `linkStyle n` dans l'ordre des flèches ; chaque bloc a un `class` et un `classDef` ; chaque bloc a une entrée dans `FICHES` et une section `###` de « Paramètres à respecter » ; `MAP` relie les noms de pièces aux blocs et aux flèches (`src/features/schema/SchemaPanel/constants.ts`). Les titres « Schéma général » et « Paramètres à respecter » ne se renomment pas.
- **Nouveau document** : fichier dans `docs/`, import et entrée dans `DOCS` (`src/features/docs/DocModal/constants.ts`), ligne dans la table « Documentation » de `README.md`, mention dans `CLAUDE.md`.
- Le document suit le modèle : toute modification du nichoir met à jour `docs/schema-electronique.md` en même temps (règle du projet).
- Vérification : `npx vitest run tests/coherence.test.ts tests/docLinks.test.ts tests/docModal.test.ts`, puis `npm run check`.
