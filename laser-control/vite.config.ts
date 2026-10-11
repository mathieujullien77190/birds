import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

// Projet autonome : `npm run dev` (http://localhost:5176) ou `npm run build` (dist/, chemins relatifs : s'ouvre depuis n'importe quel dossier ou hébergeur).
// Web Serial (le port USB de la laser) exige Chrome ou Edge et une page servie en https ou depuis localhost.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  // `@/` = src/ de ce dossier (le code de src/ utilise des chemins relatifs : l'application du nichoir l'importe sous un autre alias)
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5176 },
});
