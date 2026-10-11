import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)), '@laser': fileURLToPath(new URL('./laser-control/src', import.meta.url)) },
    dedupe: ['react', 'react-dom'],
  },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
