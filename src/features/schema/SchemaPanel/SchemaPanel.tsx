import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import { IconButton, PanelHeader } from '@/ui';
import { DOC_CSS } from '@/features/docs';
import { colorArrowheads } from '@/lib';
import type { Plank } from '@/birdhouse/model';
import type { Hover } from '@/types';
import { CSS } from './constants';
import { buildSchema, edgeKey, ficheOf, nodeKey, schemaFocus, schemaKeys } from './helpers';
import type { Keys, SchemaOptions } from './types';

/** Le schéma électrique (bloc mermaid du document) affiché à côté de la 3D : survoler un fil ou un composant dans la 3D (ou dans « Pièces ») met en
 *  surbrillance le nœud ou la flèche correspondante du schéma, et survoler le schéma met la pièce en surbrillance dans la 3D. */




export function SchemaPanel({ hover, selectedId = null, planks, onHover }: { hover: Hover | null; selectedId?: string | null; planks: Plank[]; onHover: (id: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const fromSchema = useRef(false); // vrai quand c'est le schéma lui-même qui est survolé : pas de défilement dans ce cas
  const [svg, setSvg] = useState<string>('');
  const [fiche, setFiche] = useState<string | null>(null); // module dont on affiche les caractéristiques par-dessus le schéma
  const ficheHtml = useMemo(() => { const f = fiche ? ficheOf(fiche) : undefined; return f ? (marked.parse(f.md, { async: false }) as string) : ''; }, [fiche]);
  const opts = useMemo((): SchemaOptions => ({ cam2: planks.some((p) => p.name === 'Caméra 2')}), [planks]);
  const src = useMemo(() => buildSchema(opts), [opts.cam2]); // eslint-disable-line react-hooks/exhaustive-deps
  const renders = useRef(0);
  useEffect(() => {
    let off = false;
    import('mermaid').then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, theme: 'neutral', flowchart: { htmlLabels: true, useMaxWidth: true } });
      const { svg } = await mermaid.render('schema-cote-3d-' + ++renders.current, src);
      if (!off) setSvg(svg);
    }).catch(() => { if (!off) setSvg('<p>schéma indisponible</p>'); });
    return () => { off = true; };
  }, [src]);
  useEffect(() => { if (ref.current) colorArrowheads(ref.current); }, [svg]); // pointes de flèche de la couleur de leur trait
  // surbrillance d'après la pièce survolée dans la 3D / « Pièces »
  const keys = useMemo(() => {
    const focus = schemaFocus(hover, planks, selectedId); // le survol, sinon le fil choisi (sa flèche reste allumée tant que sa fiche est ouverte)
    if (!focus) { fromSchema.current = false; return null; }
    const list = focus.plank ? planks.filter((p) => p.id === focus.plank) : planks.filter((p) => p.group === focus.group);
    const acc: Keys = { nodes: [], edges: [] };
    for (const p of list) { const k = schemaKeys(p.name); if (k) { acc.nodes.push(...k.nodes); acc.edges.push(...k.edges); } }
    return acc;
  }, [hover, selectedId, planks]);
  useEffect(() => {
    const root = ref.current; if (!root) return;
    for (const el of Array.from(root.querySelectorAll('.hl'))) el.classList.remove('hl');
    if (!keys) return;
    for (const g of Array.from(root.querySelectorAll<SVGGElement>('g.node'))) { const k = nodeKey(g.id); if (k && keys.nodes.includes(k)) g.classList.add('hl'); }
    for (const path of Array.from(root.querySelectorAll<SVGPathElement>('path.flowchart-link'))) { const e = edgeKey(path.id); if (e && keys.edges.some(([a, b]) => (a === e[0] && b === e[1]) || (a === e[1] && b === e[0]))) path.classList.add('hl'); }
    // défilement automatique : si le premier élément surligné n'est pas visible dans le panneau, on l'amène au milieu (seulement quand le survol vient de la 3D / « Pièces », pas du schéma lui-même)
    if (!fromSchema.current) { const first = root.querySelector<SVGElement>('.hl'); if (first) { const r = first.getBoundingClientRect(), b = root.getBoundingClientRect(); if (r.top < b.top || r.bottom > b.bottom || r.left < b.left || r.right > b.right) first.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' }); } }
  }, [keys, svg]);
  // survol du schéma → pièce dans la 3D
  const onMove = (e: React.MouseEvent) => {
    const t = e.target as Element;
    const g = t.closest('g.node'), path = t.closest('path.flowchart-link');
    let found: Plank | undefined;
    if (g) { const k = nodeKey(g.id); if (k) found = planks.find((p) => schemaKeys(p.name)?.nodes.includes(k)); }
    else if (path) { const ek = edgeKey(path.id); if (ek) found = planks.find((p) => schemaKeys(p.name)?.edges.some(([a, b]) => (a === ek[0] && b === ek[1]) || (a === ek[1] && b === ek[0]))); }
    fromSchema.current = true;
    onHover(found ? found.id : null);
  };
  return (
    <div className="schema-panel flex h-full w-[48rem] shrink-0 flex-col border-l border-stone-200 bg-white">
      <style>{CSS + DOC_CSS}</style>
      <PanelHeader title="Schéma électrique" hint="· survole un fil ou un composant, dans la 3D ou ici" />
      <div className="relative min-h-0 flex-1">
      <div ref={ref} className="h-full overflow-auto p-2" onClick={(e) => { const g = (e.target as Element).closest('g.node'); const k = g ? nodeKey(g.id) : null; setFiche(k && ficheOf(k) ? k : null); }} onMouseMove={onMove} onMouseLeave={() => { fromSchema.current = false; onHover(null); }} dangerouslySetInnerHTML={{ __html: svg || '<p class="p-3 text-[11px] text-stone-400">chargement du schéma…</p>' }} />
      {fiche && ficheHtml && (
        <div className="absolute inset-0 z-10 flex flex-col bg-white shadow-inner">
          <div className="flex items-center justify-between border-b border-stone-200 px-3 py-1.5 text-[11px] text-stone-500"><span>Caractéristiques du module · × pour revenir au schéma</span><IconButton size="schema" onClick={() => setFiche(null)}>×</IconButton></div>
          <div className="doc-md min-h-0 flex-1 overflow-auto px-4 py-3" dangerouslySetInnerHTML={{ __html: ficheHtml }} />
        </div>
      )}
      </div>
    </div>
  );
}
