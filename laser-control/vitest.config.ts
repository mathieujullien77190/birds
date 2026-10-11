import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        // Interface React : rendue dans un navigateur, hors périmètre des tests unitaires de la logique pure (pas de jsdom, aucune dépendance ajoutée).
        'src/components/**',
        'src/ui/**',
        'src/App/**',
        // Point d'entrée de l'application (monte React dans le DOM) et déclarations de types Vite : aucune logique à tester.
        'src/main.tsx',
        'src/vite-env.d.ts',
        // Hooks qui demandent un rendu React complet (état, effets, port série, minuteries) : ils ne font que relier la logique déjà testée (GrblClient, GcodeStreamer, parseGcode…) à l'interface.
        'src/hooks/useGcodeJob.ts',
        'src/hooks/useGrbl.ts',
        'src/hooks/useLaserMachine.ts',
        // Fichiers de barrels (`index.ts`) : uniquement des `export * from`, aucune ligne de logique.
        'src/**/index.ts',
        // Fichiers de types seuls (interfaces et alias, aucun code à l'exécution).
        'src/types.ts',
        'src/job/types.ts',
      ],
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'coverage',
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
