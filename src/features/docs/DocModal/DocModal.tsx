import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/ui';
import { CodeBrowser } from '../CodeBrowser';
import { DOCS, DOC_CSS } from './constants';
import { enhancePrices, renderDoc } from './helpers';
import type { DocDef } from './types';

/** Fenêtre des documents (Markdown, schéma mermaid, prix interactifs, code) en onglets ; Échap ou clic dehors ferme. */
export function DocModal({ doc: first, onClose }: { doc: DocDef; onClose: () => void }) {
  const [cur, setCur] = useState(first.title);
  const doc = DOCS.find((x) => x.title === cur) ?? first; // onglets : on passe d'un document à l'autre dans la même fenêtre
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(() => renderDoc(doc.md), [doc]);
  useEffect(() => {
    let off = false;
    import('mermaid').then(({ default: mermaid }) => {
      if (off || !ref.current) return;
      mermaid.initialize({ startOnLoad: false, theme: 'neutral', flowchart: { htmlLabels: true, useMaxWidth: true } });
      mermaid.run({ nodes: Array.from(ref.current.querySelectorAll<HTMLElement>('pre.mermaid')) }).catch(() => {});
    });
    if (ref.current) enhancePrices(ref.current);
    return () => { off = true; };
  }, [html]);
  const tabs = DOCS.map((x) => <button key={x.id} onClick={() => setCur(x.title)} className={`rounded px-2 py-1 text-sm font-semibold ${x.title === doc.title ? 'bg-emerald-100 text-emerald-900' : 'text-stone-500 hover:bg-stone-100'}`}>{x.title}</button>);
  return (
    <Modal header={tabs} onClose={onClose}>
      <style>{DOC_CSS}</style>
      {doc.title === 'Code' ? <CodeBrowser /> : <div ref={ref} className="doc-md overflow-y-auto px-6 py-5" dangerouslySetInnerHTML={{ __html: html }} />}
    </Modal>
  );
}
