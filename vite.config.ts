import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: './', // chemins relatifs : l'app marche en local et sur GitHub Pages (https://<utilisateur>.github.io/<dépôt>/)
  plugins: [react(), tailwindcss()],
  // @laser = le projet autonome laser-control/ (importé sans copie) ; react / react-dom dédoublonnés au cas où laser-control/node_modules existe aussi
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)), '@laser': fileURLToPath(new URL('./laser-control/src', import.meta.url)) },
    dedupe: ['react', 'react-dom'],
  },
  server: { port: 5174 },
});
