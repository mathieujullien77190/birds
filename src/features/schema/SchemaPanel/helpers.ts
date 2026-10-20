import { isWirePlank, type Plank } from '@/birdhouse/model';
import type { Hover } from '@/types';
import { MAP, FICHES, MERMAID_SRC, OPTION_NODES, SECTIONS } from './constants';
import type { Keys, SchemaOptions } from './types';

/** Schéma DYNAMIQUE : on part du schéma complet du document et on enlève les blocs et les flèches des options absentes de la scène
 *  (2ᵉ caméra : CAM2, IR2), puis les zones devenues vides. Les couleurs des traits suivent leur flèche. */
export function buildSchema(opts: SchemaOptions): string {
  const gone = new Set<string>([...(opts.cam2 ? [] : OPTION_NODES.cam2),]);
  if (!gone.size) return MERMAID_SRC;
  const lines = MERMAID_SRC.split('\n');
  const colors = lines.filter((l) => /^\s*linkStyle \d+ /.test(l)).map((l) => /stroke:([^,]+)/.exec(l)?.[1] ?? '#444');
  const out: string[] = [];
  let edge = -1, kept = 0;
  const keptColors: string[] = [];
  const isEdge = (l: string) => /<?-->|---/.test(l) && !/^\s*(subgraph|%%)/.test(l);
  const idOf = (l: string) => /^\s*([A-Z0-9]+)(\[|\(\()/.exec(l)?.[1];
  for (const l of lines) {
    if (/^\s*linkStyle /.test(l)) continue; // refait plus bas
    if (isEdge(l)) {
      edge++;
      const m = /^\s*([A-Z0-9]+)\s*(?:<?-->|---)(?:\|[^|]*\|)?\s*([A-Z0-9]+)/.exec(l);
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


/** Fiche d'un module : la section du document dont le titre commence comme prévu pour ce nœud. */
export const ficheOf = (key: string) => { const start = FICHES[key]; return start ? SECTIONS.find((s) => s.title.startsWith(start)) : undefined; };
/** Nœuds et flèches du schéma qui représentent la pièce de ce nom. */
export function schemaKeys(name: string): Keys | null { const m = MAP.find(([re]) => re.test(name)); return m ? m[1] : null; }
/** Identifiant de nœud mermaid (`flowchart-PI-12`) → clé (`PI`). */
export const nodeKey = (id: string): string | null => { const m = /flowchart-([A-Za-z0-9]+)-\d+$/.exec(id); return m ? m[1] : null; }; // mermaid préfixe l'id par celui du rendu (`schema-cote-3d-flowchart-PI-12`)
/** Identifiant de flèche mermaid (`…-L_PI_HB_0`) → [de, vers]. */
export const edgeKey = (id: string): [string, string] | null => { const m = /L[-_]([A-Za-z0-9]+)[-_]([A-Za-z0-9]+)[-_]\d+$/.exec(id); return m ? [m[1], m[2]] : null; };

/** Pièce à mettre en surbrillance dans le schéma : celle qui est survolée ; sinon, le fil (nappe, gaine) choisi, dont la fiche est ouverte. */
export function schemaFocus(hover: Hover | null, planks: Plank[], selectedId: string | null): Hover | null {
  if (hover) return hover;
  const sel = selectedId ? planks.find((p) => p.id === selectedId) : undefined;
  return sel && isWirePlank(sel) ? { plank: sel.id } : null;
}
