import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/ui';
import { colorArrowheads } from '@/lib';
import { CodeBrowser } from '../CodeBrowser';
import { DOCS, DOC_CSS } from './constants';
import { ALL_SECTIONS, enhancePrices, renderDoc } from './helpers';
import { useDocSections } from './useDocSections';
import type { DocDef } from './types';

const CHIP = 'min-h-11 shrink-0 whitespace-nowrap rounded-full px-3 text-sm md:min-h-8';

/** Fenêtre des documents (Markdown, schéma mermaid, prix interactifs, code) en onglets ; Échap ou clic dehors ferme. Un sommaire des sections `##` affiche une section à la fois. */
export function DocModal({ doc: first, onClose }: { doc: DocDef; onClose: () => void }) {
  const [cur, setCur] = useState(first.title);
  const doc = DOCS.find((x) => x.title === cur) ?? first; // onglets : on passe d'un document à l'autre dans la même fenêtre
  const ref = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const { sections, toc, current, md, prev, next, select, onLinkClick } = useDocSections(doc);
  const html = useMemo(() => renderDoc(md), [md]);
  useEffect(() => {
    let off = false;
    import('mermaid').then(({ default: mermaid }) => {
      if (off || !ref.current) return;
      mermaid.initialize({ startOnLoad: false, theme: 'neutral', flowchart: { htmlLabels: true, useMaxWidth: true } });
      mermaid.run({ nodes: Array.from(ref.current.querySelectorAll<HTMLElement>('pre.mermaid')) }).then(() => { if (!off && ref.current) colorArrowheads(ref.current); }).catch(() => {});
    });
    if (ref.current) enhancePrices(ref.current);
    return () => { off = true; };
  }, [html]);
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = 0; }, [doc.id, current]);
  const tabs = DOCS.map((x) => <button key={x.id} onClick={() => setCur(x.title)} className={`rounded px-2 py-1 text-sm font-semibold ${x.title === doc.title ? 'bg-emerald-100 text-emerald-900' : 'text-stone-500 hover:bg-stone-100'}`}>{x.title}</button>);
  const chip = (on: boolean) => `${CHIP} ${on ? 'bg-emerald-600 font-semibold text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`;
  const nav = 'min-h-11 rounded-lg border border-stone-300 px-4 text-sm font-semibold text-stone-700 hover:bg-stone-100 disabled:opacity-30 disabled:hover:bg-transparent md:min-h-9';
  return (
    <Modal header={tabs} onClose={onClose}>
      <style>{DOC_CSS}</style>
      {doc.title === 'Code' ? <CodeBrowser /> : (
        <>
          {toc && (
            <nav aria-label="Sommaire" className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-stone-200 px-4 py-2">
              {sections.map((s) => <button key={s.id} type="button" aria-current={s.id === current ? 'true' : undefined} onClick={() => select(s.id)} className={chip(s.id === current)}>{s.title}</button>)}
              <button type="button" aria-pressed={current === ALL_SECTIONS} onClick={() => select(ALL_SECTIONS)} className={`${chip(current === ALL_SECTIONS)} border border-emerald-600`}>Tout afficher</button>
            </nav>
          )}
          <div ref={scroller} className="overflow-y-auto">
            <div ref={ref} className="doc-md px-6 py-5" onClick={onLinkClick} dangerouslySetInnerHTML={{ __html: html }} />
          </div>
          {toc && current !== ALL_SECTIONS && ( // toujours affiché, hors de la zone qui défile : « précédente / suivante » reste sous les yeux
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-stone-200 bg-white px-6 py-3">
              <button type="button" className={nav} disabled={!prev} onClick={() => prev && select(prev)}>◀ précédente</button>
              <button type="button" className={nav} disabled={!next} onClick={() => next && select(next)}>suivante ▶</button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
