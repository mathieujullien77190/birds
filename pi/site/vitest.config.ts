import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        // Point d'entrée : monte l'app dans #root au chargement du module, rien à vérifier hors navigateur ; l'App est testée directement.
        'src/main.tsx',
        // Types TypeScript seuls : effacés à la compilation, aucune ligne exécutable.
        'src/types/**',
        'src/**/types.ts',
        // Barrels purement réexportants (`export * from ...`) : aucune logique ; les modules réexportés sont couverts par leurs propres tests.
        'src/**/index.ts',
      ],
      // Branches à 99,5 et non 100 : une seule branche (sur 255) est inatteignable, HistoryChart.tsx l.12 (`points.length <= 1 ? 0` dans x(i)) :
      // x() n'est appelée que par ChartSvg, rendu seulement quand hasData(points) est vrai (au moins 2 points), donc le cas 0 / 1 point est mort.
      // Tout le reste est à 100 % (lignes, instructions, fonctions, branches).
      thresholds: { lines: 100, branches: 99.5, functions: 100, statements: 100 },
    },
  },
});
