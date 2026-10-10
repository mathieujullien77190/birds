/** Les outils de l'application : l'URL (?tool=…) l'emporte, sinon celui donné à `npm run dev <outil>`, sinon le menu. */
export type ToolId = 'planks' | 'bird' | 'birdhouse' | 'house';

export const TOOLS: { id: ToolId; title: string; text: string }[] = [
  { id: 'planks', title: 'Plaques', text: 'Des plaques de bois d\'une épaisseur commune : les dimensionner, les placer à la souris ou au curseur, les tourner, leur ajouter des crans, et sortir le SVG pour le laser.' },
  { id: 'bird', title: 'Oiseau (visionneuse STL)', text: 'Déposer un STL ou un OBJ, le réduire, le retoucher, en tirer des tranches pour la découpe laser ou un patron papier.' },
  { id: 'birdhouse', title: 'Pavé isolé (nichoir)', text: 'Un pavé à 6 faces en panneaux sandwich (contreplaqué, laine de bois, contreplaqué), angles lisses, boulonnés : vue 3D, pièces et planche de découpe en SVG.' },
];
/** Outils joignables par l'URL (?tool=…) mais absents du menu. */
export const HIDDEN_TOOLS: ToolId[] = ['house'];

const isTool = (s: string | null | undefined): s is ToolId => !!s && (TOOLS.some((t) => t.id === s) || HIDDEN_TOOLS.includes(s as ToolId));

export function currentTool(): ToolId | null {
  const q = new URLSearchParams(location.search).get('tool');
  if (q === 'menu') return null;
  if (isTool(q)) return q;
  return isTool(import.meta.env.VITE_TOOL) ? import.meta.env.VITE_TOOL : null;
}

export const toolUrl = (id: ToolId | 'menu') => `?tool=${id}`;
