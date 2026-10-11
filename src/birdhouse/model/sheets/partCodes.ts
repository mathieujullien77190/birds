import type { Hole, Plank, PlankScene } from '../types';

/**
 * Codes des plaques découpées au laser, pour les retrouver au montage : le préfixe de la catégorie (le groupe) + un numéro à deux chiffres
 * (« T-01 », « T-02 »…). Des pièces strictement identiques portent le MÊME numéro. Fonctions pures : aucun import de three.js.
 *
 * Quelles plaques : celles que `nestSheets` met sur les planches, c'est-à-dire sans `special` (ni composants, ni fils, ni pavés, ni isolant).
 *
 * Préfixe : la première lettre du nom du groupe, sans accent, en majuscule (Toit → T, Habillage → H, Ventilation → V). Quand des groupes de noms
 * différents commencent par la même lettre, ils prennent TOUS le plus court préfixe qui les distingue (Électronique / Entrée → EL / EN,
 * Corps / Couvercle → COR / COU). Si deux noms restent identiques sur toute leur longueur (l'un est le début de l'autre), le plus court garde son nom entier et l'autre
 * prend une lettre de plus ; faute de mieux, un chiffre est ajouté. Sans groupe, le préfixe est « X ».
 * La catégorie est le NOM du groupe (deux nichoirs dans la scène partagent donc leurs codes et leurs numéros).
 *
 * Numéro : dans chaque catégorie, dans l'ordre d'apparition des plaques dans la scène, un nouveau numéro à chaque forme jamais vue ; deux plaques sont identiques si
 * elles ont même matériau et même épaisseur, mêmes dimensions, même contour libre, mêmes trous (formes et positions) et mêmes crans. Les contours sont comparés tels quels : une pièce
 * symétrique (en miroir) d'une autre n'est PAS identique.
 */

const GROUPLESS = 'X';
const r = (n: number) => Math.round(n * 100) / 100;

/** Plaque découpée au laser (la même règle que `nestSheets`). */
export const isLaserPlank = (p: Plank): boolean => !p.special;

/** Nom du groupe d'une plaque (catégorie), ou chaîne vide sans groupe. */
function categoryOf(s: PlankScene, p: Plank): string {
  return (p.group && s.groupNames?.[p.group]) || '';
}

/** Lettres seules d'un nom, sans accent, en majuscules (« Électronique » → « ELECTRONIQUE »). */
export const letters = (name: string): string => name.normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase();

const holeSig = (h: Hole): string => (h.poly ? `P${h.poly.map(([x, y]) => `${r(x)},${r(y)}`).join(' ')}` : `${h.shape}${r(h.x)},${r(h.y)},${r(h.size)},${r(h.sh ?? h.size)},${r(h.r ?? 0)}`);

/** Empreinte d'une plaque : deux plaques strictement identiques ont la même ; le nom, l'identifiant, la position dans la scène ne comptent pas. */
export function plankSignature(p: Plank, t: number): string {
  const thick = p.material ? (p.depth ?? t) : t;
  return JSON.stringify([
    p.material ?? '', r(thick), r(p.w), r(p.h),
    p.poly ? p.poly.map(([x, y]) => [r(x), r(y)]) : null,
    p.holes.map(holeSig).sort(),
    p.notches.map((n) => `${n.edge}${r(n.pos)},${r(n.width)},${r(n.depth)}`).sort(),
  ]);
}

/**
 * Préfixe de chaque catégorie (nom de groupe) qui a au moins une plaque découpée, dans l'ordre d'apparition.
 */
export function categoryPrefixes(names: string[]): Map<string, string> {
  const uniq = [...new Set(names)];
  const out = new Map<string, string>();
  const byLetter = new Map<string, string[]>();
  for (const n of uniq) { const l = letters(n); const k = l ? l[0] : GROUPLESS; byLetter.set(k, [...(byLetter.get(k) ?? []), n]); }
  for (const [first, group] of byLetter) {
    if (group.length === 1) { out.set(group[0], first); continue; }
    const used = new Set<string>();
    // plus court préfixe commun à tous qui les distingue ; le plus court nom garde son nom entier s'il est le début d'un autre
    let len = 2;
    const maxLen = Math.max(...group.map((g) => letters(g).length));
    while (len <= maxLen && new Set(group.map((g) => letters(g).slice(0, len))).size < group.length) len++;
    for (const g of group) {
      let pre = (letters(g) || first).slice(0, len);
      while (used.has(pre)) pre += '2';
      used.add(pre);
      out.set(g, pre);
    }
  }
  return out;
}

/** Code (« T01 ») de chaque plaque découpée de la scène, par identifiant de plaque. Les plaques non découpées n'en ont pas. */
export function plankCodes(s: PlankScene): Map<string, string> {
  const laser = s.planks.filter(isLaserPlank);
  const prefixes = categoryPrefixes(laser.map((p) => categoryOf(s, p)));
  const numbers = new Map<string, Map<string, number>>(); // catégorie → empreinte → numéro
  const codes = new Map<string, string>();
  for (const p of laser) {
    const cat = categoryOf(s, p);
    let byShape = numbers.get(cat);
    if (!byShape) { byShape = new Map(); numbers.set(cat, byShape); }
    const sig = plankSignature(p, s.t);
    let n = byShape.get(sig);
    if (n === undefined) { n = byShape.size + 1; byShape.set(sig, n); }
    codes.set(p.id, `${prefixes.get(cat)}-${String(n).padStart(2, '0')}`);
  }
  return codes;
}

/** Une ligne de la liste « Plaques à découper » : un code, les noms des pièces qui le portent, leur groupe, leur matériau et leur nombre. */
export interface PartRow { code: string; names: string[]; group: string; material: 'contreplaqué' | 'MDF' | 'okoumé'; qty: number }

/** Liste des codes de la scène (ordre des codes tels que numérotés), avec la quantité de pièces identiques. */
export function partTable(s: PlankScene): PartRow[] {
  const codes = plankCodes(s);
  const rows = new Map<string, PartRow>();
  for (const p of s.planks) {
    const code = codes.get(p.id);
    if (!code) continue;
    let row = rows.get(code);
    if (!row) { row = { code, names: [], group: categoryOf(s, p) || '—', material: p.material === 'mdf' ? 'MDF' : p.material === 'okoume' ? 'okoumé' : 'contreplaqué', qty: 0 }; rows.set(code, row); }
    row.qty++;
    if (!row.names.includes(p.name)) row.names.push(p.name);
  }
  return [...rows.values()];
}
