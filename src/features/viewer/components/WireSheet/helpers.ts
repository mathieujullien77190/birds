import { isWirePlank, wireInfo, type Plank, type WireInfo } from '@/birdhouse/model';

/** Longueur affichée : « 23,4 cm » (virgule française). */
export const fmtCm = (cm: number): string => `${String(cm).replace('.', ',')} cm`;

/** Fiche à afficher sur la vue : la pièce choisie seule est un fil, une nappe ou la gaine, et sa fiche n'a pas été fermée. `null` sinon. */
export function wireSheetFor(selected: Plank | null, planks: Plank[], groupSel: string | null, closedId: string | null): WireInfo | null {
  if (!selected || groupSel || selected.id === closedId || !isWirePlank(selected)) return null;
  return wireInfo(selected, planks);
}

/** Lignes de la fiche, « étiquette → valeur » ; les lignes sans valeur ne sont pas affichées. */
export function wireSheetRows(i: WireInfo): [string, string][] {
  const rows: [string, string | null][] = [
    ['De', i.from], ['Vers', i.to], ['Rôle', i.role],
    ['Tension', i.voltage], ['Courant', i.current],
    [i.kind === 'ribbon' ? 'Largeur' : 'Diamètre dessiné', `${i.kind === 'ribbon' ? '' : 'Ø '}${String(i.diameter).replace('.', ',')} mm`],
    ['Section', i.section],
    ['Longueur du trajet', `${fmtCm(i.lengthCm)} (coudes arrondis)`],
    ['À prévoir', i.cordNote],
    ['Raccord', i.connector],
    ['Broches du Pi', i.pins.length ? i.pins.map((p) => `broche ${p}`).join(', ') : null],
    ['À savoir', i.notes],
  ];
  return rows.filter((r): r is [string, string] => !!r[1]);
}

/** Une ligne pour la carte de « Pièces » : « de → vers · longueur » (`null` si ce n'est pas un fil). */
export function wireSummary(p: Plank, planks: Plank[]): string | null {
  const i = wireInfo(p, planks);
  return i ? `${i.known ? `${i.from} → ${i.to} · ` : ''}${fmtCm(i.lengthCm)}` : null;
}
