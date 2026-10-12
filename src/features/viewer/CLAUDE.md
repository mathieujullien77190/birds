# features/viewer/ — écran et interface

- `Planks/Planks.tsx` : état et assemblage. `constants.ts` = clés localStorage (`STORAGE`, figées par les tests).
- `hooks/` : `useThreeView` (scène + contrôleurs), `useSceneSync` (état → meshes), `useHistory` (Ctrl+Z), `useAssembly` (mode Montage)…
- `components/` : panneaux gauche / droit, `PiecesList`, `ViewToolbar`, `AssemblyPanel`, `WireSheet`…
- Version téléphone (≤ 767 px) : `MobileBar`, `PartsSheet`.
- Logique dans des `helpers.ts` / hooks mesurés par la couverture ; composants React purs exclus (raison écrite dans `vitest.config.ts`).
