import type { Plank, PlankScene } from '../types';
import { SPARE_RE } from '../nest/spares';
import { plankCodes } from '../sheets/partCodes';
import { ASSEMBLY_BLOCKS, LID_BACK, LID_RE, SEQ, SUBASSEMBLIES, type PieceRule, type Ref, type Text } from './data';
import type { AssemblyBlock, AssemblyStep } from './types';
import { wiringText } from './wiring';

/**
 * Montage pas à pas (fonctions pures, aucun import de three.js) : `assemblySteps(scene)` donne les étapes dans l'ordre.
 * Les étapes viennent de la table `SEQ` (data.ts) : chaque règle prend, par leur NOM, les pièces qui lui correspondent et qu'aucune règle
 * précédente n'a prises ; une pièce est donc dans une seule étape. Les pièces strictement identiques (même code de plaque) se posent
 * ensemble dans une seule étape. Pas d'étape pour le document, ni pour les pièces de rechange (« … (rechange k) »).
 * Les pièces qu'aucune règle ne connaît (scène modifiée à la main) vont dans le bloc « Autres pièces ».
 */

const slug = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const base = (name: string): string => name.replace(/ \d+(\.\d+)?$/, '');

/** Pièce qui reçoit une étape : tout sauf le document et les rechanges. */
export const isAssemblable = (p: Plank): boolean => p.special !== 'doc' && !p.spareOf && !SPARE_RE.test(p.name);

interface Piece { p: Plank; code?: string }

/** Titre d'un groupe de pièces posées ensemble : « Nom (CODE) », ou « 3 × Nom (CODE) » pour des pièces identiques. */
function groupTitle(items: Piece[]): string {
  const names = items.map((i) => i.p.name);
  const code = items[0].code ? ` (${items[0].code})` : '';
  if (names.length === 1) return names[0] + code;
  const bases = new Set(names.map(base));
  if (bases.size === 1) return `${names.length} × ${[...bases][0]}${code}`;
  const joined = names.join(' + ');
  return `${names.length} × ${joined.length <= 60 ? joined : base(names[0]) + ' …'}${code}`;
}

/** Coupe une liste de pièces en groupes : une étape par code de plaque (pièces identiques), une par pièce pour le reste. */
function split(items: Piece[]): Piece[][] {
  const groups = new Map<string, Piece[]>();
  for (const i of items) { const k = i.code ? `c:${i.code}` : `n:${i.p.id}`; groups.set(k, [...(groups.get(k) ?? []), i]); }
  return [...groups.values()];
}

/** Les étapes de montage de la scène, dans l'ordre. */
export function assemblySteps(s: PlankScene): AssemblyStep[] {
  const codes = plankCodes(s);
  const pieces: Piece[] = s.planks.filter(isAssemblable).map((p) => ({ p, code: codes.get(p.id) }));
  if (!pieces.length) return [];
  const taken = new Set<string>();
  const find = (re: RegExp): Piece | undefined => pieces.find((i) => re.test(i.p.name));
  const ref: Ref = (re) => { const i = find(re); return i ? `« ${i.p.name} »${i.code ? ` (${i.code})` : ''}` : `« ${re.source.replace(/[\\^$]/g, '')} »`; };
  const text = (t: Text | undefined): string | undefined => (typeof t === 'function' ? t(ref) : t);
  const out: AssemblyStep[] = [];
  const ids = new Set<string>();
  const uniqueId = (id: string): string => { let n = id, k = 2; while (ids.has(n)) n = `${id}-${k++}`; ids.add(n); return n; };

  for (const rule of SEQ) {
    if (!('re' in rule)) {
      const focus = (rule.focus ?? []).flatMap((re) => pieces.filter((i) => re.test(i.p.name)).map((i) => i.p.id));
      if (rule.focus && !focus.length) continue; // les pièces concernées n'existent pas dans cette scène
      out.push({ id: uniqueId(rule.id), title: rule.title, kind: rule.kind, block: rule.block, pieceIds: [], ...(focus.length ? { focusIds: [...new Set(focus)] } : {}), text: text(rule.text) });
      continue;
    }
    const r: PieceRule = rule;
    let found = pieces.filter((i) => !taken.has(i.p.id) && r.re.test(i.p.name));
    if (r.limit !== undefined) found = found.slice(0, r.limit);
    if (!found.length) continue;
    found.forEach((i) => taken.add(i.p.id));
    const groups = r.all ? [found] : split(found);
    groups.forEach((g, gi) => {
      out.push({
        id: uniqueId(groups.length > 1 ? `${r.id}.${slug(g[0].p.name)}` : r.id), title: r.title ?? groupTitle(g), kind: r.kind, block: r.block,
        pieceIds: g.map((i) => i.p.id), ...(r.text && gi === 0 ? { text: text(r.text) } : {}), // la consigne n'est écrite qu'une fois, sur la première étape de la règle
      });
    });
  }
  // pièces que la table ne connaît pas : une étape chacune (ou par code), dans un bloc à part
  for (const g of split(pieces.filter((i) => !taken.has(i.p.id)))) out.push({ id: uniqueId(`divers.${slug(g[0].p.name)}`), title: groupTitle(g), kind: 'placer', block: 'divers', pieceIds: g.map((i) => i.p.id) });

  // câblage : chaque étape « cabler » dit d'où à où va le fil et le NOM des broches du Pi (broche 12 = GPIO18, PWM…)
  for (const st of out) if (st.kind === 'cabler' && st.pieceIds.length) { const w = wiringText(s.planks, st.pieceIds); if (w) st.text = st.text ? `${st.text}
${w}` : w; }
  // le toit en okoumé est soulevé pendant tout le travail dans le grenier : caché de la première étape d'électronique jusqu'à sa pose
  const lid = pieces.filter((i) => LID_RE.test(i.p.name)).map((i) => i.p.id);
  const back = out.findIndex((st) => st.id === LID_BACK);
  const from = out.findIndex((st) => st.block === 'banc');
  if (lid.length && back > from && from >= 0) for (let k = from; k < back; k++) out[k].hideIds = lid;
  // sous-ensembles montés à part (module d'aération, zone caméra, goulotte) : cachés des étapes qui suivent leur bloc jusqu'à leur pose
  for (const sub of SUBASSEMBLIES) {
    const ids = pieces.filter((i) => sub.re.test(i.p.name)).map((i) => i.p.id);
    const start = out.findIndex((st) => st.block === sub.block), first = out.findIndex((st, k) => k > start && st.block !== sub.block), put = out.findIndex((st) => st.id === sub.put);
    if (ids.length && put > first) for (let k = first; k < put; k++) out[k].hideIds = [...(out[k].hideIds ?? []), ...ids];
  }
  return out;
}

/** Les blocs présents dans les étapes, dans l'ordre, avec l'indice de leur première étape et leur nombre d'étapes. */
export function assemblyBlocks(steps: AssemblyStep[]): (AssemblyBlock & { first: number; count: number })[] {
  return ASSEMBLY_BLOCKS.flatMap((b) => {
    const first = steps.findIndex((st) => st.block === b.id);
    return first < 0 ? [] : [{ ...b, first, count: steps.filter((st) => st.block === b.id).length }];
  });
}
