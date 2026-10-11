import type { Plank, PlankScene } from '@/birdhouse/model';

export interface PartsRow { key: string; name: string; group: string | null; ids: string[]; members: Plank[] }

/** Lignes du volet mobile « afficher / cacher » : un groupe = une ligne (dans l'ordre d'apparition), une plaque seule = une ligne ; le document « Schéma électronique » (jamais dessiné) est omis. */
export function partsRows(sc: PlankScene): PartsRow[] {
  const rows: PartsRow[] = [];
  const byGroup = new Map<string, PartsRow>();
  for (const p of sc.planks) {
    if (p.special === 'doc') continue;
    if (!p.group) { rows.push({ key: p.id, name: p.name, group: null, ids: [p.id], members: [p] }); continue; }
    let r = byGroup.get(p.group);
    if (!r) { r = { key: p.group, name: sc.groupNames?.[p.group] ?? 'Groupe', group: p.group, ids: [], members: [] }; byGroup.set(p.group, r); rows.push(r); }
    r.ids.push(p.id); r.members.push(p);
  }
  return rows;
}
