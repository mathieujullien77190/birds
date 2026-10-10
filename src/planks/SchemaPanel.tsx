import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import schemaMd from '../../docs/schema-electronique.md?raw';
import { DOC_CSS } from './DocModal';
import type { Plank } from './model';

/** Le schéma électrique (bloc mermaid du document) affiché à côté de la 3D : survoler un fil ou un composant dans la 3D (ou dans « Pièces ») met en
 *  surbrillance le nœud ou la flèche correspondante du schéma, et survoler le schéma met la pièce en surbrillance dans la 3D. */

/** Source mermaid du schéma général (premier bloc ```mermaid du document). */
const MERMAID_SRC = (/```mermaid\n([\s\S]*?)```/.exec(schemaMd)?.[1] ?? 'flowchart TB\n  X["schéma introuvable"]').trim();

type Keys = { nodes: string[]; edges: [string, string][] };
/** Schéma DYNAMIQUE : on part du schéma complet du document et on enlève les blocs et les flèches des options absentes de la scène
 *  (Peltier + capteur : HB, FILT, TEC, HOT, SENS ; 2ᵉ caméra : CAM2, IR2 ; Solaire : PV, MPPT), puis les zones devenues vides. Les couleurs des traits suivent leur flèche. */
const OPTION_NODES = { clim: ['HB', 'FILT', 'TEC', 'HOT', 'SENS', 'RAIL'], cam2: ['CAM2', 'IR2'], solar: ['PV', 'MPPT'] } as const;
function buildSchema(opts: { clim: boolean; cam2: boolean; solar: boolean }): string {
  const gone = new Set<string>([...(opts.clim ? [] : OPTION_NODES.clim), ...(opts.cam2 ? [] : OPTION_NODES.cam2), ...(opts.solar ? [] : OPTION_NODES.solar)]);
  if (!gone.size) return MERMAID_SRC;
  const lines = MERMAID_SRC.split('\n');
  const colors = lines.filter((l) => /^\s*linkStyle \d+ /.test(l)).map((l) => /stroke:([^,]+)/.exec(l)?.[1] ?? '#444');
  const out: string[] = [];
  let edge = -1, kept = 0;
  const keptColors: string[] = [];
  const isEdge = (l: string) => /-->|---/.test(l) && !/^\s*(subgraph|%%)/.test(l);
  const idOf = (l: string) => /^\s*([A-Z0-9]+)(\[|\(\()/.exec(l)?.[1];
  for (const l of lines) {
    if (/^\s*linkStyle /.test(l)) continue; // refait plus bas
    if (isEdge(l)) {
      edge++;
      const m = /^\s*([A-Z0-9]+)\s*(?:-->|---)(?:\|[^|]*\|)?\s*([A-Z0-9]+)/.exec(l);
      if (!opts.clim && m && m[1] === 'FUSE' && m[2] === 'RAIL') { out.push('  FUSE --> BUCK'); keptColors.push(colors[edge] ?? '#444'); kept++; continue; } // sans Peltier : pas de Wago, le fusible va droit au convertisseur
      if (m && (gone.has(m[1]) || gone.has(m[2]))) continue;
      out.push(l); keptColors.push(colors[edge] ?? '#444'); kept++;
      continue;
    }
    const id = idOf(l);
    if (id && gone.has(id)) continue;
    const cls = /^(\s*class )([A-Z0-9,]+)( \w+)$/.exec(l);
    if (cls) { const ids = cls[2].split(',').filter((x) => !gone.has(x)); if (!ids.length) continue; out.push(cls[1] + ids.join(',') + cls[3]); continue; }
    out.push(l);
  }
  // zones vides : un « subgraph X[…] » suivi directement de son « end » disparaît
  const clean: string[] = [];
  for (let i = 0; i < out.length; i++) {
    if (/^\s*subgraph /.test(out[i]) && /^\s*end\s*$/.test(out[i + 1] ?? '')) { i++; continue; }
    clean.push(out[i]);
  }
  keptColors.forEach((c, n) => clean.push('  linkStyle ' + n + ' stroke:' + c + ',stroke-width:2.5px'));
  void kept;
  return clean.join('\n');
}

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
  [/^Fil (fusible|batterie −) → convertisseur/, { nodes: [], edges: [['FUSE', 'BUCK']] }],
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
/** Fiches des composants : les sections « ### … » du document (tableaux de paramètres), repérées par le début de leur titre. */
const FICHES: Record<string, string> = {
  PV: 'Panneau solaire', MPPT: 'Régulateur de charge', BAT: 'Batterie', FUSE: 'Fusible', BUCK: 'Convertisseur', PI: 'Raspberry Pi', HB: 'Pont en H', FILT: 'Filtre LC',
  TEC: 'Peltier', HOT: 'Sonde de température', CAM1: 'Caméras', CAM2: 'Caméras', IR: 'Carte de 4 LED', IR2: 'Carte de 4 LED', SENS: 'Capteur de température', SW: 'Module 2 × MOSFET', RAIL: 'Wago 221',
};
const SECTIONS = (() => {
  const out: { title: string; md: string }[] = [];
  const params = schemaMd.slice(schemaMd.indexOf('## Paramètres à respecter'));
  for (const part of params.split(/^### /m).slice(1)) { const nl = part.indexOf('\n'); out.push({ title: part.slice(0, nl).trim(), md: '### ' + part.trim() }); }
  return out;
})();
const ficheOf = (key: string) => { const start = FICHES[key]; return start ? SECTIONS.find((s) => s.title.startsWith(start)) : undefined; };
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
.schema-panel .cluster-label,.schema-panel .cluster-label *{font-size:24px!important;font-weight:700!important;color:#064e3b!important;fill:#064e3b!important;line-height:1.3!important} /* titres des zones : Dehors, grenier, sous le plafond */
.schema-panel .cluster-label foreignObject{overflow:visible}
`;

export function SchemaPanel({ hover, planks, onHover }: { hover: { plank?: string; group?: string } | null; planks: Plank[]; onHover: (id: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const fromSchema = useRef(false); // vrai quand c'est le schéma lui-même qui est survolé : pas de défilement dans ce cas
  const [svg, setSvg] = useState<string>('');
  const [fiche, setFiche] = useState<string | null>(null); // module dont on affiche les caractéristiques par-dessus le schéma
  const ficheHtml = useMemo(() => { const f = fiche ? ficheOf(fiche) : undefined; return f ? (marked.parse(f.md, { async: false }) as string) : ''; }, [fiche]);
  const opts = useMemo(() => ({ clim: planks.some((p) => /^Peltier/.test(p.name)), cam2: planks.some((p) => p.name === 'Caméra 2'), solar: planks.some((p) => /^Régulateur/.test(p.name)) }), [planks]);
  const src = useMemo(() => buildSchema(opts), [opts.clim, opts.cam2, opts.solar]); // eslint-disable-line react-hooks/exhaustive-deps
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
      <style>{CSS + DOC_CSS}</style>
      <div className="border-b border-stone-200 px-3 py-2 text-[11px] font-semibold text-stone-700">Schéma électrique <span className="font-normal text-stone-400">· survole un fil ou un composant, dans la 3D ou ici</span></div>
      <div className="relative min-h-0 flex-1">
      <div ref={ref} className="h-full overflow-auto p-2" onClick={(e) => { const g = (e.target as Element).closest('g.node'); const k = g ? nodeKey(g.id) : null; setFiche(k && ficheOf(k) ? k : null); }} onMouseMove={onMove} onMouseLeave={() => { fromSchema.current = false; onHover(null); }} dangerouslySetInnerHTML={{ __html: svg || '<p class="p-3 text-[11px] text-stone-400">chargement du schéma…</p>' }} />
      {fiche && ficheHtml && (
        <div className="absolute inset-0 z-10 flex flex-col bg-white shadow-inner">
          <div className="flex items-center justify-between border-b border-stone-200 px-3 py-1.5 text-[11px] text-stone-500"><span>Caractéristiques du module · × pour revenir au schéma</span><button onClick={() => setFiche(null)} className="rounded px-2 text-lg leading-none text-stone-500 hover:bg-stone-100">×</button></div>
          <div className="doc-md min-h-0 flex-1 overflow-auto px-4 py-3" dangerouslySetInnerHTML={{ __html: ficheHtml }} />
        </div>
      )}
      </div>
    </div>
  );
}
