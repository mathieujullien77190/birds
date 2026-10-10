import { useEffect, useMemo, useRef, useState } from 'react';
import schemaMd from '../../docs/schema-electronique.md?raw';
import type { Plank } from './model';

/** Le schéma électrique (bloc mermaid du document) affiché à côté de la 3D : survoler un fil ou un composant dans la 3D (ou dans « Pièces ») met en
 *  surbrillance le nœud ou la flèche correspondante du schéma, et survoler le schéma met la pièce en surbrillance dans la 3D. */

/** Source mermaid du schéma général (premier bloc ```mermaid du document). */
const MERMAID_SRC = (/```mermaid\n([\s\S]*?)```/.exec(schemaMd)?.[1] ?? 'flowchart TB\n  X["schéma introuvable"]').trim();

type Keys = { nodes: string[]; edges: [string, string][] };
/** Pièce (nom) → nœuds et flèches du schéma. Les flèches sont [de, vers] comme dans la source mermaid. */
const MAP: [RegExp, Keys][] = [
  [/^Raspberry Pi/, { nodes: ['PI'], edges: [] }],
  [/^Caméra 2$/, { nodes: ['CAM2'], edges: [] }],
  [/^Caméra$/, { nodes: ['CAM1'], edges: [] }],
  [/^LED infrarouges extérieures/, { nodes: ['IR2'], edges: [] }],
  [/^LED infrarouges$/, { nodes: ['IR'], edges: [] }],
  [/^Capteur température/, { nodes: ['SENS'], edges: [] }],
  [/^Sonde température/, { nodes: ['HOT'], edges: [] }],
  [/^(Peltier|Dissipateur|Plaque froide)/, { nodes: ['TEC'], edges: [] }],
  [/^Pont en H/, { nodes: ['HB'], edges: [] }],
  [/^Filtre LC/, { nodes: ['FILT'], edges: [] }],
  [/^Module 2 MOSFET/, { nodes: ['SW'], edges: [] }],
  [/^Convertisseur/, { nodes: ['BUCK'], edges: [] }],
  [/^Batterie/, { nodes: ['BAT'], edges: [] }],
  [/^Fusible/, { nodes: ['FUSE'], edges: [] }],
  [/^Régulateur/, { nodes: ['MPPT'], edges: [] }],
  [/^Panneau solaire/, { nodes: ['PV'], edges: [] }],
  [/^Câble 12 V/, { nodes: [], edges: [['PV', 'MPPT']] }],
  [/^(Gaine des fils|Fil régulateur → batterie)/, { nodes: [], edges: [['MPPT', 'FUSE']] }],
  [/^Fil fusible → batterie/, { nodes: [], edges: [['FUSE', 'BAT']] }],
  [/^Fil rail → pont en H/, { nodes: [], edges: [['RAIL', 'HB']] }],
  [/^Fil rail → convertisseur/, { nodes: [], edges: [['RAIL', 'BUCK']] }],
  [/^Fil Peltier/, { nodes: [], edges: [['FILT', 'TEC']] }],
  [/^Fil filtre → pont en H/, { nodes: [], edges: [['HB', 'FILT']] }],
  [/^Fil (PWM|INA|INB|masse commande|VDD)/, { nodes: [], edges: [['PI', 'HB']] }],
  [/^Nappe caméra 2/, { nodes: [], edges: [['PI', 'CAM2']] }],
  [/^Nappe caméra$/, { nodes: [], edges: [['PI', 'CAM1']] }],
  [/^Fil 5 V LED extérieures/, { nodes: [], edges: [['PI', 'IR2']] }],
  [/^Fil masse LED extérieures/, { nodes: [], edges: [['SW', 'IR2']] }],
  [/^Fil 5 V \(rouge\)/, { nodes: [], edges: [['PI', 'IR']] }],
  [/^Fil masse \(noir\)/, { nodes: [], edges: [['SW', 'IR'], ['PI', 'SENS']] }], // deux fils portent ce nom : la masse des LED du nid et celle du capteur
  [/^Fil (IN1|IN2|masse module)/, { nodes: [], edges: [['PI', 'SW']] }],
  [/^Fil (3,3 V|SDA|SCL)/, { nodes: [], edges: [['PI', 'SENS']] }],
  [/^Fil sonde/, { nodes: [], edges: [['HOT', 'PI']] }],
];
export function schemaKeys(name: string): Keys | null { const m = MAP.find(([re]) => re.test(name)); return m ? m[1] : null; }

/** Identifiant de nœud mermaid (`flowchart-PI-12`) → clé (`PI`). */
const nodeKey = (id: string): string | null => { const m = /flowchart-([A-Za-z0-9]+)-\d+$/.exec(id); return m ? m[1] : null; }; // mermaid préfixe l'id par celui du rendu (`schema-cote-3d-flowchart-PI-12`)
/** Identifiant de flèche mermaid (`…-L_PI_HB_0`) → [de, vers]. */
const edgeKey = (id: string): [string, string] | null => { const m = /L[-_]([A-Za-z0-9]+)[-_]([A-Za-z0-9]+)[-_]\d+$/.exec(id); return m ? [m[1], m[2]] : null; };

const CSS = `
.schema-panel svg{max-width:100%;height:auto}
.schema-panel g.node.hl rect,.schema-panel g.node.hl polygon,.schema-panel g.node.hl circle,.schema-panel g.node.hl path{stroke:#f59e0b!important;stroke-width:4px!important} /* le bloc garde sa couleur, seul son contour grossit */
.schema-panel path.hl{stroke-width:7px!important} /* le trait garde la couleur de son fil, il grossit */
.schema-panel g.node,.schema-panel path.flowchart-link{cursor:pointer}
`;

export function SchemaPanel({ hover, planks, onHover }: { hover: { plank?: string; group?: string } | null; planks: Plank[]; onHover: (id: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const fromSchema = useRef(false); // vrai quand c'est le schéma lui-même qui est survolé : pas de défilement dans ce cas
  const [svg, setSvg] = useState<string>('');
  useEffect(() => {
    let off = false;
    import('mermaid').then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, theme: 'neutral', flowchart: { htmlLabels: true, useMaxWidth: true } });
      const { svg } = await mermaid.render('schema-cote-3d', MERMAID_SRC);
      if (!off) setSvg(svg);
    }).catch(() => { if (!off) setSvg('<p>schéma indisponible</p>'); });
    return () => { off = true; };
  }, []);
  // surbrillance d'après la pièce survolée dans la 3D / « Pièces »
  const keys = useMemo(() => {
    if (!hover) { fromSchema.current = false; return null; }
    const list = hover.plank ? planks.filter((p) => p.id === hover.plank) : planks.filter((p) => p.group === hover.group);
    const acc: Keys = { nodes: [], edges: [] };
    for (const p of list) { const k = schemaKeys(p.name); if (k) { acc.nodes.push(...k.nodes); acc.edges.push(...k.edges); } }
    return acc;
  }, [hover, planks]);
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
      <style>{CSS}</style>
      <div className="border-b border-stone-200 px-3 py-2 text-[11px] font-semibold text-stone-700">Schéma électrique <span className="font-normal text-stone-400">· survole un fil ou un composant, dans la 3D ou ici</span></div>
      <div ref={ref} className="min-h-0 flex-1 overflow-auto p-2" onMouseMove={onMove} onMouseLeave={() => { fromSchema.current = false; onHover(null); }} dangerouslySetInnerHTML={{ __html: svg || '<p class="p-3 text-[11px] text-stone-400">chargement du schéma…</p>' }} />
    </div>
  );
}
