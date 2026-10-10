import { useMemo, useState, type ReactNode } from 'react';
import { hljs } from './highlight';
import { LANG, NOTE, SOURCES } from './constants';
import { buildTree } from './helpers';
import type { Node } from './types';

/** Explorateur du code du dossier pi/ : arborescence à gauche, code coloré avec numéros de ligne à droite. */
export function CodeBrowser() {
  const files = useMemo(() => Object.fromEntries(Object.entries(SOURCES).map(([k, v]) => [k.replace(/^\//, ''), v])), []);
  const tree = useMemo(() => buildTree(Object.keys(files)), [files]);
  const [sel, setSel] = useState('pi/nichoir.py');
  const [open, setOpen] = useState<Set<string>>(new Set(['pi', 'pi/site', 'pi/site/src', 'pi/site/src/components']));
  const text = files[sel] ?? '';
  const ext = sel.split('.').pop() ?? '';
  const html = useMemo(() => {
    const lang = LANG[ext];
    const lines = (lang && hljs.getLanguage(lang) ? hljs.highlight(text, { language: lang }).value : text.replace(/&/g, '&amp;').replace(/</g, '&lt;')).split('\n');
    return lines.map((l, i) => `<tr><td class="ln">${i + 1}</td><td>${l || ' '}</td></tr>`).join('');
  }, [text, ext]);
  const nodeRow = (n: Node, depth: number): ReactNode => {
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
