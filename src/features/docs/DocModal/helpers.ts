import { marked } from 'marked';
import { hljs } from './highlight';
import { VERIFIED_KEY, isChecked, persistVerified, verifiedKey } from './verified';

/** Tableau des prix interactif : un tableau Markdown dont l'en-tête est « Groupe | Élément | Prix » est regroupé par groupe, chaque ligne et chaque groupe ont une case à cocher,
 *  les sous-totaux et le total se recalculent ; les lignes décochées sont gardées dans localStorage (`plaques-prix-decoches`).
 *  5ᵉ colonne « Vérifié » : case par ligne (hors du total), compteur « N / M vérifiés » par groupe et au total. Valeur de départ = le `[x]` / `[ ]` du Markdown ;
 *  en développement (`dev`) un clic réécrit la ligne de `docs/schema-electronique.md` (plugin Vite) ; sinon, ou si la requête échoue, le choix reste dans localStorage (`plaques-prix-verifies`)
 *  et une note le dit. */
export function enhancePrices(root: HTMLElement, dev: boolean = import.meta.env.DEV, doFetch?: typeof fetch) {
  const KEY = 'plaques-prix-decoches';
  let off = new Set<string>();
  try { off = new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]')); } catch { /* rien */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...off])); } catch { /* rien */ } };
  let over: Record<string, boolean> = {}; // cases « Vérifié » changées dans le navigateur seulement (prod, ou écriture du fichier impossible)
  try { const o = JSON.parse(localStorage.getItem(VERIFIED_KEY) ?? '{}'); if (o && typeof o === 'object' && !Array.isArray(o)) over = o; } catch { /* rien */ }
  const saveOver = () => { try { localStorage.setItem(VERIFIED_KEY, JSON.stringify(over)); } catch { /* rien */ } };
  for (const table of Array.from(root.querySelectorAll('table'))) {
    const head = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent?.trim());
    if (head[0] !== 'Groupe' || head[2] !== 'Prix') continue;
    const rows = Array.from(table.querySelectorAll('tbody tr')).map((tr) => { const c = tr.querySelectorAll('td'); return { group: c[0].textContent!.trim(), label: c[1].textContent!.trim(), html: c[1].innerHTML, link: c[3]?.innerHTML ?? '', md: isChecked(c[4]?.textContent), price: parseFloat((c[2].textContent!).replace(/[^0-9.,]/g, '').replace(',', '.')) || 0 }; });
    const groups = [...new Set(rows.map((r) => r.group))];
    const fmt = (v: number) => v.toLocaleString('fr-FR') + ' €';
    const thead = table.querySelector('thead')!; thead.innerHTML = '<tr><th></th><th>Élément</th><th>Prix</th><th>Modèle exact / lien</th><th>Vérifié</th></tr>';
    const tbody = table.querySelector('tbody')!; tbody.innerHTML = '';
    const note = document.createElement('p'); note.className = 'doc-price-note';
    const say = (fileWritten: boolean) => { note.textContent = fileWritten ? 'Vérifié : le fichier docs/schema-electronique.md est réécrit à chaque case cochée.' : 'Vérifié : enregistré dans le navigateur seulement ; en développement, le fichier docs/schema-electronique.md est réécrit.'; };
    say(dev);
    (table.closest('.tw') ?? table).before(note);
    const isV = (r: { group: string; label: string; md: boolean }) => over[verifiedKey(r.group, r.label)] ?? r.md;
    const setV = (r: { group: string; label: string; md: boolean }, v: boolean) => {
      const key = verifiedKey(r.group, r.label);
      over[key] = v; saveOver(); // d'abord le navigateur ; la requête ci-dessous le retire si le fichier a pu être réécrit
      void persistVerified({ groupe: r.group, element: r.label, verified: v }, dev, doFetch).then((written) => {
        if (written) { r.md = v; delete over[key]; saveOver(); } // le fichier fait foi : plus d'écart à garder
        say(written);
      });
    };
    const render = () => {
      tbody.innerHTML = '';
      let total = 0;
      for (const g of groups) {
        const items = rows.filter((r) => r.group === g), sub = items.filter((r) => !off.has(r.label)).reduce((t, r) => t + r.price, 0), allOff = items.every((r) => off.has(r.label));
        total += sub;
        const trg = document.createElement('tr'); trg.className = 'doc-price-group';
        trg.innerHTML = `<td><input type="checkbox" ${allOff ? '' : 'checked'} title="Tout le groupe" /></td><td><strong>${g}</strong></td><td><strong>${fmt(sub)}</strong></td><td></td><td>${items.filter(isV).length} / ${items.length} vérifiés</td>`;
        trg.querySelector('input')!.addEventListener('change', (e) => { const on = (e.target as HTMLInputElement).checked; for (const r of items) { if (on) off.delete(r.label); else off.add(r.label); } save(); render(); });
        tbody.appendChild(trg);
        for (const r of items) {
          const tr = document.createElement('tr'); const isOff = off.has(r.label); if (isOff) tr.className = 'doc-price-off';
          tr.innerHTML = `<td><input type="checkbox" ${isOff ? '' : 'checked'} /></td><td>${r.html}</td><td>${fmt(r.price)}</td><td>${r.link}</td><td><input type="checkbox" class="doc-verified" ${isV(r) ? 'checked' : ''} title="Lien vérifié à la main" /></td>`;
          tr.querySelector('input')!.addEventListener('change', (e) => { if ((e.target as HTMLInputElement).checked) off.delete(r.label); else off.add(r.label); save(); render(); });
          tr.querySelector('input.doc-verified')!.addEventListener('change', (e) => { setV(r, (e.target as HTMLInputElement).checked); render(); });
          tbody.appendChild(tr);
        }
      }
      const trt = document.createElement('tr'); trt.className = 'doc-price-total';
      trt.innerHTML = `<td></td><td><strong>Total coché</strong></td><td><strong>${fmt(total)}</strong></td><td></td><td><strong>${rows.filter(isV).length} / ${rows.length} vérifiés</strong></td>`;
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

/** Une section d'un document : le chapeau avant le premier `##` (`intro`) ou un `##` avec son contenu jusqu'au `##` suivant. */
export interface DocSection { id: string; title: string; md: string; intro?: boolean }

/** Valeur de « section affichée » pour montrer le document entier. */
export const ALL_SECTIONS = '*';
/** Nombre minimal de sections `##` pour que la fenêtre propose un sommaire. */
export const MIN_TOC_SECTIONS = 4;

/** Titre → identifiant d'ancre : minuscules, sans accents, tirets (« Prix (ordre de grandeur, 2026) » → « prix-ordre-de-grandeur-2026 »). */
export function slugify(title: string): string {
  return title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
}

/** Découpe un document Markdown en sections selon ses titres `##` (les `##` dans un bloc de code ne comptent pas ; `###` reste dans sa section). Le chapeau avant le premier `##` est la section `intro` (absente s'il est vide). */
export function splitSections(md: string, introTitle = 'Introduction'): DocSection[] {
  const parts: { title: string; intro: boolean; lines: string[] }[] = [{ title: introTitle, intro: true, lines: [] }];
  let fence: string | null = null;
  for (const line of md.split(/\r?\n/)) {
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (f) { if (!fence) fence = f[1][0]; else if (f[1][0] === fence) fence = null; }
    const h = !fence && !f ? /^##\s+(.+?)\s*$/.exec(line) : null;
    if (h) parts.push({ title: h[1].replace(/[`*]/g, ''), intro: false, lines: [line] }); else parts[parts.length - 1].lines.push(line);
  }
  const seen = new Map<string, number>();
  return parts.filter((p) => !p.intro || p.lines.join('').trim() !== '').map((p) => {
    const base = slugify(p.title), n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { id: n === 1 ? base : `${base}-${n}`, title: p.title, md: p.lines.join('\n'), ...(p.intro ? { intro: true as const } : {}) };
  });
}

/** Le document a-t-il assez de sections `##` pour un sommaire ? */
export const hasToc = (sections: DocSection[]): boolean => sections.filter((s) => !s.intro).length >= MIN_TOC_SECTIONS;

/** Section à afficher : « tout » si demandé, la section mémorisée si elle existe encore, sinon la première. */
export function resolveSection(sections: DocSection[], saved: string | undefined): string {
  if (saved === ALL_SECTIONS) return ALL_SECTIONS;
  return sections.some((s) => s.id === saved) ? saved! : sections[0]?.id ?? ALL_SECTIONS;
}

/** Section voisine (`dir` = −1 précédente, +1 suivante) ; `null` aux bornes ou si la section courante est inconnue. */
export function stepSection(sections: DocSection[], id: string, dir: -1 | 1): string | null {
  const i = sections.findIndex((s) => s.id === id);
  return i < 0 ? null : sections[i + dir]?.id ?? null;
}

/** Section visée par un lien interne `#ancre` (identifiant de section, ou titre slugifié) ; `null` si aucune. */
export function sectionForHash(sections: DocSection[], hash: string): string | null {
  const raw = hash.replace(/^#/, '');
  let key = raw; try { key = decodeURIComponent(raw); } catch { /* ancre telle quelle */ }
  const slug = slugify(key);
  return sections.find((s) => s.id === key || s.id === slug)?.id ?? null;
}

/** Vrai si la cible d'une touche est un champ de saisie (les flèches du clavier y déplacent le curseur). */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable === true || el.getAttribute('contenteditable') === 'true';
}

/** Section mémorisée par document (JSON `{ idDuDocument: idDeSection }`) ; un texte invalide donne `{}`. */
export function parseSavedSections(raw: string | null): Record<string, string> {
  try {
    const o = JSON.parse(raw ?? '{}');
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
    return Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  } catch { return {}; }
}
