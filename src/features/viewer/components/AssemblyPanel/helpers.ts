import type { AssemblyStep } from '@/birdhouse/model';

/** Un bloc de la consigne : un paragraphe, ou une liste à puces. */
export type TextBlock = { type: 'p'; text: string } | { type: 'ul'; items: string[] };

/** Découpe une consigne : chaque ligne est un paragraphe, les lignes qui commencent par « - » se regroupent en liste. */
export function parseText(text: string | undefined): TextBlock[] {
  const out: TextBlock[] = [];
  for (const raw of (text ?? '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const last = out[out.length - 1];
    if (line.startsWith('- ')) {
      const item = line.slice(2).trim();
      if (last?.type === 'ul') last.items.push(item); else out.push({ type: 'ul', items: [item] });
    } else out.push({ type: 'p', text: line });
  }
  return out;
}

/** Ramène un indice dans [0, n − 1] (0 s'il n'y a aucune étape). */
export const clampIndex = (i: number, n: number): number => (n <= 0 ? 0 : Math.min(Math.max(Math.trunc(i) || 0, 0), n - 1));

/** « 12 / 140 » et le pourcentage de la barre de progression. */
export function progressOf(index: number, n: number): { label: string; percent: number } {
  if (n <= 0) return { label: '0 / 0', percent: 0 };
  return { label: `${index + 1} / ${n}`, percent: Math.round(((index + 1) / n) * 100) };
}

/** Indice de l'étape enregistrée (son identifiant) ; 0 si elle n'existe plus. */
export function indexOfStored(raw: string | null, steps: AssemblyStep[]): number {
  const i = raw ? steps.findIndex((s) => s.id === raw) : -1;
  return i < 0 ? 0 : i;
}

/** Pièces affichées à l'étape `index` : celles des étapes déjà faites et de l'étape en cours, sauf les cachées par l'étape ; `highlight` = celles de l'étape en cours. */
export function viewOf(steps: AssemblyStep[], index: number): { visible: Set<string>; highlight: Set<string> } {
  const cur = steps[clampIndex(index, steps.length)];
  const visible = new Set<string>();
  const highlight = new Set<string>();
  if (!cur) return { visible, highlight };
  for (let k = 0; k <= clampIndex(index, steps.length); k++) for (const id of steps[k].pieceIds) visible.add(id);
  for (const id of cur.hideIds ?? []) visible.delete(id);
  for (const id of [...cur.pieceIds, ...(cur.focusIds ?? [])]) { visible.add(id); highlight.add(id); }
  return { visible, highlight };
}

/** Identifiants des pièces à cacher dans la 3D : toutes celles de la scène qui ne sont pas affichées à l'étape. */
export const hiddenFor = (allIds: string[], visible: Set<string>): Set<string> => new Set(allIds.filter((id) => !visible.has(id)));

/** Sens d'un balayage : 1 = étape suivante (vers la gauche), −1 = précédente (vers la droite), 0 = trop court ou trop vertical (défilement). */
export function swipeDirection(dx: number, dy: number, min = 50): -1 | 0 | 1 {
  if (Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
}

/** Touche du clavier → action du panneau (flèches, Échap) ; rien quand on tape dans un champ. */
export function keyAction(key: string, typing: boolean): 'next' | 'prev' | 'close' | null {
  if (key === 'Escape') return 'close';
  if (typing) return null;
  if (key === 'ArrowRight') return 'next';
  if (key === 'ArrowLeft') return 'prev';
  return null;
}
