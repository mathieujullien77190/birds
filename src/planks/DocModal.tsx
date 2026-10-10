import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import hljs from 'highlight.js/lib/core';
import python from 'highlight.js/lib/languages/python';
import ini from 'highlight.js/lib/languages/ini';
import bash from 'highlight.js/lib/languages/bash';
import 'highlight.js/styles/github.css';
hljs.registerLanguage('python', python); hljs.registerLanguage('ini', ini); hljs.registerLanguage('sh', bash); hljs.registerLanguage('bash', bash);
import schema from '../../docs/schema-electronique.md?raw';
import logiciel from '../../docs/logiciel.md?raw';
import { CodeBrowser } from './CodeBrowser';

/** Documents lisibles dans l'app (fichiers Markdown du dossier docs/). */
export const DOCS = [{ id: 'schema', title: 'Schéma électronique', md: schema }, { id: 'logiciel', title: 'Logiciel (Pi, page web)', md: logiciel }, { id: 'code', title: 'Code', md: '' }];

const CSS = `
.doc-md{font:15px/1.65 system-ui,sans-serif;color:#1c1917}
.doc-md h1{font-size:1.9rem;line-height:1.2;margin:0 0 .6em;color:#064e3b;text-wrap:balance}
.doc-md h2{font-size:1.25rem;margin:2em 0 .6em;padding-bottom:.3em;border-bottom:2px solid #a7f3d0;color:#065f46}
.doc-md h3{font-size:1.02rem;margin:1.6em 0 .5em;color:#292524}
.doc-md p{margin:.7em 0;max-width:70ch}
.doc-md ul{margin:.6em 0;padding-left:1.3em}
.doc-md li{margin:.25em 0}
.doc-md a{color:#0369a1;text-decoration:underline}
.doc-md strong{color:#292524}
.doc-md .tw{overflow-x:auto;margin:.8em 0;border:1px solid #e7e5e4;border-radius:8px}
.doc-md table{border-collapse:collapse;width:100%;font-size:13px}
.doc-md th{background:#ecfdf5;color:#064e3b;text-align:left;font-weight:600}
.doc-md th,.doc-md td{padding:6px 10px;border-bottom:1px solid #e7e5e4;vertical-align:top}
.doc-md tr:last-child td{border-bottom:0}
.doc-md td:first-child{font-weight:500}
.doc-md .doc-price-group td{background:#f0fdf4;border-top:2px solid #a7f3d0}
.doc-md .doc-price-off td{color:#a8a29e;text-decoration:line-through}
.doc-md .doc-price-off td:first-child{text-decoration:none}
.doc-md .doc-price-total td{background:#ecfdf5;border-top:2px solid #10b981;font-size:14px}
.doc-md input[type=checkbox]{accent-color:#059669;cursor:pointer}
.doc-md pre:not(.mermaid){background:#f6f8fa;border:1px solid #e7e5e4;border-radius:8px;padding:12px;overflow-x:auto;margin:1em 0;font:12.5px/1.5 ui-monospace,Consolas,monospace}
.doc-md code{font:12.5px/1.5 ui-monospace,Consolas,monospace}
.doc-md p code,.doc-md li code,.doc-md td code{background:#f5f5f4;border-radius:4px;padding:1px 4px}
.doc-md pre.mermaid{background:#fafaf9;border:1px solid #e7e5e4;border-radius:8px;padding:12px;overflow-x:auto;text-align:center;margin:1em 0}
`;

/** Tableau des prix interactif : un tableau Markdown dont l'en-tête est « Groupe | Élément | Prix » est regroupé par groupe, chaque ligne et chaque groupe ont une case à cocher,
 *  les sous-totaux et le total se recalculent ; les lignes décochées sont gardées dans localStorage (`plaques-prix-decoches`). */
function enhancePrices(root: HTMLElement) {
  const KEY = 'plaques-prix-decoches';
  let off = new Set<string>();
  try { off = new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]')); } catch { /* rien */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...off])); } catch { /* rien */ } };
  for (const table of Array.from(root.querySelectorAll('table'))) {
    const head = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent?.trim());
    if (head[0] !== 'Groupe' || head[2] !== 'Prix') continue;
    const rows = Array.from(table.querySelectorAll('tbody tr')).map((tr) => { const c = tr.querySelectorAll('td'); return { group: c[0].textContent!.trim(), label: c[1].textContent!.trim(), price: parseFloat((c[2].textContent ?? '').replace(/[^0-9.,]/g, '').replace(',', '.')) || 0 }; });
    const groups = [...new Set(rows.map((r) => r.group))];
    const fmt = (v: number) => v.toLocaleString('fr-FR') + ' €';
    const thead = table.querySelector('thead')!; thead.innerHTML = '<tr><th></th><th>Élément</th><th>Prix</th></tr>';
    const tbody = table.querySelector('tbody')!; tbody.innerHTML = '';
    const render = () => {
      tbody.innerHTML = '';
      let total = 0;
      for (const g of groups) {
        const items = rows.filter((r) => r.group === g), sub = items.filter((r) => !off.has(r.label)).reduce((t, r) => t + r.price, 0), allOff = items.every((r) => off.has(r.label));
        total += sub;
        const trg = document.createElement('tr'); trg.className = 'doc-price-group';
        trg.innerHTML = `<td><input type="checkbox" ${allOff ? '' : 'checked'} title="Tout le groupe" /></td><td><strong>${g}</strong></td><td><strong>${fmt(sub)}</strong></td>`;
        trg.querySelector('input')!.addEventListener('change', (e) => { const on = (e.target as HTMLInputElement).checked; for (const r of items) { if (on) off.delete(r.label); else off.add(r.label); } save(); render(); });
        tbody.appendChild(trg);
        for (const r of items) {
          const tr = document.createElement('tr'); const isOff = off.has(r.label); if (isOff) tr.className = 'doc-price-off';
          tr.innerHTML = `<td><input type="checkbox" ${isOff ? '' : 'checked'} /></td><td>${r.label}</td><td>${fmt(r.price)}</td>`;
          tr.querySelector('input')!.addEventListener('change', (e) => { if ((e.target as HTMLInputElement).checked) off.delete(r.label); else off.add(r.label); save(); render(); });
          tbody.appendChild(tr);
        }
      }
      const trt = document.createElement('tr'); trt.className = 'doc-price-total';
      trt.innerHTML = `<td></td><td><strong>Total coché</strong></td><td><strong>${fmt(total)}</strong></td>`;
      tbody.appendChild(trt);
    };
    render();
  }
}

export function DocModal({ doc: first, onClose }: { doc: { title: string; md: string }; onClose: () => void }) {
  const [cur, setCur] = useState(first.title);
  const doc = DOCS.find((x) => x.title === cur) ?? first; // onglets : on passe d'un document à l'autre dans la même fenêtre
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(() => {
    const r = new marked.Renderer();
    const code = r.code.bind(r) as (...a: unknown[]) => string;
    r.code = ((a: unknown, b?: string) => {
      const text = typeof a === 'string' ? a : (a as { text: string }).text, lang = typeof a === 'string' ? b : (a as { lang?: string }).lang;
      if (lang === 'mermaid') return `<pre class="mermaid">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`;
      if (lang && hljs.getLanguage(lang)) return `<pre><code class="hljs language-${lang}">${hljs.highlight(text, { language: lang }).value}</code></pre>`; // coloration syntaxique (python, ini, sh)
      return code(a, b);
    }) as typeof r.code;
    const table = r.table.bind(r) as (...a: unknown[]) => string;
    r.table = ((...a: unknown[]) => `<div class="tw">${table(...a)}</div>`) as typeof r.table;
    return marked.parse(doc.md, { renderer: r, async: false }) as string;
  }, [doc]);
  useEffect(() => {
    let off = false;
    import('mermaid').then(({ default: mermaid }) => {
      if (off || !ref.current) return;
      mermaid.initialize({ startOnLoad: false, theme: 'neutral', flowchart: { htmlLabels: true, useMaxWidth: true } });
      mermaid.run({ nodes: Array.from(ref.current.querySelectorAll<HTMLElement>('pre.mermaid')) }).catch(() => {});
    });
    if (ref.current) enhancePrices(ref.current);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => { off = true; window.removeEventListener('keydown', key); };
  }, [html, onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4" onClick={onClose}>
      <style>{CSS}</style>
      <div className="flex max-h-full w-full max-w-6xl flex-col rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3">
          <div className="flex items-center gap-1">{DOCS.map((x) => <button key={x.id} onClick={() => setCur(x.title)} className={`rounded px-2 py-1 text-sm font-semibold ${x.title === doc.title ? 'bg-emerald-100 text-emerald-900' : 'text-stone-500 hover:bg-stone-100'}`}>{x.title}</button>)}</div>
          <button onClick={onClose} className="rounded px-2 text-xl leading-none text-stone-500 hover:bg-stone-100" title="Fermer (Échap)">×</button>
        </div>
        {doc.title === 'Code' ? <CodeBrowser /> : <div ref={ref} className="doc-md overflow-y-auto px-6 py-5" dangerouslySetInnerHTML={{ __html: html }} />}
      </div>
    </div>
  );
}
