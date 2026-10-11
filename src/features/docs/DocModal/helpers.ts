import { marked } from 'marked';
import { hljs } from './highlight';

/** Tableau des prix interactif : un tableau Markdown dont l'en-tête est « Groupe | Élément | Prix » est regroupé par groupe, chaque ligne et chaque groupe ont une case à cocher,
 *  les sous-totaux et le total se recalculent ; les lignes décochées sont gardées dans localStorage (`plaques-prix-decoches`). */
export function enhancePrices(root: HTMLElement) {
  const KEY = 'plaques-prix-decoches';
  let off = new Set<string>();
  try { off = new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]')); } catch { /* rien */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...off])); } catch { /* rien */ } };
  for (const table of Array.from(root.querySelectorAll('table'))) {
    const head = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent?.trim());
    if (head[0] !== 'Groupe' || head[2] !== 'Prix') continue;
    const rows = Array.from(table.querySelectorAll('tbody tr')).map((tr) => { const c = tr.querySelectorAll('td'); return { group: c[0].textContent!.trim(), label: c[1].textContent!.trim(), html: c[1].innerHTML, link: c[3]?.innerHTML ?? '', price: parseFloat((c[2].textContent!).replace(/[^0-9.,]/g, '').replace(',', '.')) || 0 }; });
    const groups = [...new Set(rows.map((r) => r.group))];
    const fmt = (v: number) => v.toLocaleString('fr-FR') + ' €';
    const thead = table.querySelector('thead')!; thead.innerHTML = '<tr><th></th><th>Élément</th><th>Prix</th><th>Modèle exact / lien</th></tr>';
    const tbody = table.querySelector('tbody')!; tbody.innerHTML = '';
    const render = () => {
      tbody.innerHTML = '';
      let total = 0;
      for (const g of groups) {
        const items = rows.filter((r) => r.group === g), sub = items.filter((r) => !off.has(r.label)).reduce((t, r) => t + r.price, 0), allOff = items.every((r) => off.has(r.label));
        total += sub;
        const trg = document.createElement('tr'); trg.className = 'doc-price-group';
        trg.innerHTML = `<td><input type="checkbox" ${allOff ? '' : 'checked'} title="Tout le groupe" /></td><td><strong>${g}</strong></td><td><strong>${fmt(sub)}</strong></td><td></td>`;
        trg.querySelector('input')!.addEventListener('change', (e) => { const on = (e.target as HTMLInputElement).checked; for (const r of items) { if (on) off.delete(r.label); else off.add(r.label); } save(); render(); });
        tbody.appendChild(trg);
        for (const r of items) {
          const tr = document.createElement('tr'); const isOff = off.has(r.label); if (isOff) tr.className = 'doc-price-off';
          tr.innerHTML = `<td><input type="checkbox" ${isOff ? '' : 'checked'} /></td><td>${r.html}</td><td>${fmt(r.price)}</td><td>${r.link}</td>`;
          tr.querySelector('input')!.addEventListener('change', (e) => { if ((e.target as HTMLInputElement).checked) off.delete(r.label); else off.add(r.label); save(); render(); });
          tbody.appendChild(tr);
        }
      }
      const trt = document.createElement('tr'); trt.className = 'doc-price-total';
      trt.innerHTML = `<td></td><td><strong>Total coché</strong></td><td><strong>${fmt(total)}</strong></td><td></td>`;
      tbody.appendChild(trt);
    };
    render();
  }
}

/** Markdown → HTML : blocs mermaid laissés tels quels pour mermaid, autres blocs colorés (python, ini, sh), tableaux dans un cadre défilant. */
export function renderDoc(md: string): string {
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
  const link = r.link.bind(r) as (...a: unknown[]) => string;
  r.link = ((...a: unknown[]) => link(...a).replace(/^<a /, '<a target="_blank" rel="noopener noreferrer" ')) as typeof r.link; // les liens s'ouvrent dans un nouvel onglet
  return marked.parse(md, { renderer: r, async: false }) as string;
}
