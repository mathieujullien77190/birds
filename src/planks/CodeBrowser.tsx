import { useMemo, useState } from 'react';
import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import ini from 'highlight.js/lib/languages/ini';
import yaml from 'highlight.js/lib/languages/yaml';
hljs.registerLanguage('typescript', typescript); hljs.registerLanguage('javascript', javascript); hljs.registerLanguage('python', python); hljs.registerLanguage('xml', xml);
hljs.registerLanguage('css', css); hljs.registerLanguage('json', json); hljs.registerLanguage('markdown', markdown); hljs.registerLanguage('ini', ini); hljs.registerLanguage('yaml', yaml);

/** Tout le code du projet, lu à la compilation (aucun fichier n'est chargé à l'exécution) : l'application, le programme du Pi, les documents, les réglages. */
const SOURCES = import.meta.glob(
  ['/src/**/*.{ts,tsx,css}', '/pi/**/*.{py,html,js,service,txt,md}', '/docs/*.md', '/.github/workflows/*.yml', '/README.md', '/CLAUDE.md', '/index.html', '/vite.config.ts', '/package.json', '/tsconfig.json'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const LANG: Record<string, string> = { ts: 'typescript', tsx: 'typescript', js: 'javascript', py: 'python', html: 'xml', css: 'css', json: 'json', md: 'markdown', service: 'ini', yml: 'yaml', txt: 'ini' };
/** Ce que fait chaque fichier ou dossier, en une ligne (affiché dans l'arborescence). */
const NOTE: Record<string, string> = {
  'src/planks/model.ts': 'le modèle : génération du nichoir, plaques, crans, découpe',
  'src/planks/Planks.tsx': "l'écran : vue 3D, menus, volet « Pièces », découpe laser",
  'src/planks/DocModal.tsx': 'fenêtre des documents (Markdown, schéma, prix)',
  'src/planks/SchemaPanel.tsx': 'schéma électrique à côté de la 3D',
  'src/planks/CodeBrowser.tsx': 'cet explorateur de code',
  'src/ui/Sheet2D.tsx': 'planche de découpe à plat',
  'src/ui/Slider.tsx': 'curseur', 'src/ui/kit.tsx': 'boutons, sections, puces',
  'src/main.tsx': "point d'entrée", 'src/style.css': 'styles',
  'pi/nichoir.py': 'le programme Python du Raspberry Pi', 'pi/web/index.html': 'la page web de test', 'pi/web/app.js': 'son JavaScript',
  'pi/nichoir.service': 'démarrage automatique (systemd)', 'pi/requirements.txt': 'bibliothèques Python', 'pi/README.md': 'installation sur le Pi',
  'docs/schema-electronique.md': 'le document électronique', 'docs/logiciel.md': 'le document logiciel',
  'CLAUDE.md': 'notes de travail détaillées', 'README.md': 'présentation du projet', 'index.html': 'page HTML', 'vite.config.ts': 'réglages Vite',
  '.github/workflows/pages.yml': 'publication GitHub Pages',
};

type Node = { name: string; path: string; dir: boolean; children: Node[] };
function buildTree(paths: string[]): Node {
  const root: Node = { name: '', path: '', dir: true, children: [] };
  for (const p of paths) {
    let cur = root; const parts = p.split('/');
    parts.forEach((name, i) => {
      const path = parts.slice(0, i + 1).join('/'), dir = i < parts.length - 1;
      let n = cur.children.find((c) => c.name === name);
      if (!n) { n = { name, path, dir, children: [] }; cur.children.push(n); }
      cur = n;
    });
  }
  const sort = (n: Node) => { n.children.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1)); n.children.forEach(sort); };
  sort(root);
  return root;
}

export function CodeBrowser() {
  const files = useMemo(() => Object.fromEntries(Object.entries(SOURCES).map(([k, v]) => [k.replace(/^\//, ''), v])), []);
  const tree = useMemo(() => buildTree(Object.keys(files)), [files]);
  const [sel, setSel] = useState('src/planks/model.ts');
  const [open, setOpen] = useState<Set<string>>(new Set(['src', 'src/planks', 'pi', 'docs']));
  const text = files[sel] ?? '';
  const ext = sel.split('.').pop() ?? '';
  const html = useMemo(() => {
    const lang = LANG[ext];
    const lines = (lang && hljs.getLanguage(lang) ? hljs.highlight(text, { language: lang }).value : text.replace(/&/g, '&amp;').replace(/</g, '&lt;')).split('\n');
    return lines.map((l, i) => `<tr><td class="ln">${i + 1}</td><td>${l || ' '}</td></tr>`).join('');
  }, [text, ext]);
  const nodeRow = (n: Node, depth: number): React.ReactNode => {
    const isOpen = open.has(n.path);
    return (
      <div key={n.path}>
        <button
          onClick={() => (n.dir ? setOpen((s) => { const x = new Set(s); if (x.has(n.path)) x.delete(n.path); else x.add(n.path); return x; }) : setSel(n.path))}
          className={`flex w-full items-baseline gap-1 rounded px-1 py-0.5 text-left text-[12px] hover:bg-stone-100 ${sel === n.path ? 'bg-emerald-100 font-semibold text-emerald-900' : 'text-stone-700'}`}
          style={{ paddingLeft: 4 + depth * 12 }}
          title={NOTE[n.path]}
        >
          <span className="w-3 shrink-0 text-stone-400">{n.dir ? (isOpen ? '▾' : '▸') : ''}</span>
          <span className="truncate">{n.name}</span>
        </button>
        {n.dir && isOpen && n.children.map((c) => nodeRow(c, depth + 1))}
      </div>
    );
  };
  return (
    <div className="code-browser flex h-[70vh] min-h-0">
      <style>{`.code-browser .ln{user-select:none;color:#a8a29e;text-align:right;padding-right:10px;width:1%;white-space:nowrap}.code-browser table{border-collapse:collapse;font:12px/1.45 ui-monospace,Consolas,monospace}.code-browser td{white-space:pre;vertical-align:top}`}</style>
      <div className="w-64 shrink-0 overflow-y-auto border-r border-stone-200 p-2">{tree.children.map((c) => nodeRow(c, 0))}</div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-stone-200 px-3 py-1.5 text-[12px]"><span className="font-semibold text-stone-800">{sel}</span> <span className="text-stone-500">{NOTE[sel] ? `· ${NOTE[sel]} · ` : '· '}{text.split('\n').length} lignes</span></div>
        <div className="hljs min-h-0 flex-1 overflow-auto bg-[#f6f8fa] p-2"><table><tbody dangerouslySetInnerHTML={{ __html: html }} /></table></div>
      </div>
    </div>
  );
}
