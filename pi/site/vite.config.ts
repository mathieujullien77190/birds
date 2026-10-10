import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/** Le Pi sert la page telle quelle : un script classique (pas de module), une feuille de style, tout en relatif. */
function classicScript(): Plugin {
  return {
    name: 'pi-classic-script',
    enforce: 'post',
    transformIndexHtml(html) {
      return html
        .replace(/<script type="module" crossorigin src="[^"]+"><\/script>\s*/g, '')
        .replace(/<link rel="stylesheet" crossorigin href="/g, '<link rel="stylesheet" href="')
        .replace('</body>', (m) => `  <script src="./app.js"></script>\n${m}`);
    },
  };
}

// Projet autonome : `npm run build` ecrit la sortie versionnee dans ../web (le Pi n'a pas Node, Flask la sert telle quelle).
export default defineConfig({
  base: './',
  plugins: [react(), classicScript()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // `npm run dev` : l'API et les flux sont ceux de pi/nichoir.py (NICHOIR_MOCK=1 python nichoir.py, port 8080)
  server: { port: 5175, proxy: { '/api': 'http://localhost:8080', '/video': 'http://localhost:8080' } },
  build: {
    outDir: '../web',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: (a) => (a.name?.endsWith('.css') ? 'app.css' : 'assets/[name][extname]'),
      },
    },
  },
});
