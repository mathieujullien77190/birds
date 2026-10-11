import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { applyVerified, isLocalHost, parseVerifiedBody, VERIFIED_ROUTE } from './src/features/docs/DocModal/verified';

/** DÉVELOPPEMENT SEULEMENT (`apply: 'serve'`, absent du build et de GitHub Pages) : POST /__doc/verified { groupe, element, verified } réécrit la case « Vérifié » d'UNE ligne du tableau des prix.
 *  N'écrit que docs/schema-electronique.md (chemin fixe), corps validé strictement, requêtes locales seulement (Host et adresse du client). */
function docVerified(): Plugin {
  const file = fileURLToPath(new URL('./docs/schema-electronique.md', import.meta.url));
  const localIp = (a?: string) => a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
  return {
    name: 'doc-verified', apply: 'serve',
    configureServer(server) {
      server.middlewares.use(VERIFIED_ROUTE, (req, res) => {
        const end = (code: number, msg: string) => { res.statusCode = code; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end(msg); };
        if (req.method !== 'POST') return end(405, 'POST seulement');
        if (!isLocalHost(req.headers.host) || !localIp(req.socket.remoteAddress)) return end(403, 'local seulement');
        if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) return end(415, 'JSON seulement');
        let raw = '', big = false;
        req.on('data', (c: Buffer) => { raw += c; if (raw.length > 8192) { big = true; req.destroy(); } });
        req.on('end', async () => {
          if (big) return end(413, 'corps trop grand');
          let body; try { body = parseVerifiedBody(JSON.parse(raw)); } catch { body = null; }
          if (!body) return end(400, 'corps invalide');
          try {
            const r = applyVerified(await readFile(file, 'utf8'), body.groupe, body.element, body.verified);
            if (!r.ok) return end(r.error === 'ambigu' ? 409 : 404, r.error);
            await writeFile(file, r.md, 'utf8');
            end(200, 'ok');
          } catch { end(500, 'écriture impossible'); }
        });
      });
    },
  };
}

export default defineConfig({
  base: './', // chemins relatifs : l'app marche en local et sur GitHub Pages (https://<utilisateur>.github.io/<dépôt>/)
  plugins: [react(), tailwindcss(), docVerified()],
  // @laser = le projet autonome laser-control/ (importé sans copie) ; react / react-dom dédoublonnés au cas où laser-control/node_modules existe aussi
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)), '@laser': fileURLToPath(new URL('./laser-control/src', import.meta.url)) },
    dedupe: ['react', 'react-dom'],
  },
  server: { port: 5174 },
});
