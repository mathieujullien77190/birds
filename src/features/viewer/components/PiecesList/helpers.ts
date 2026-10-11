import type { Plank, PlankScene } from '@/birdhouse/model';

/** Échelle des dessins à plat : la plus large plaque tient dans le volet. */
export function cardScale(planks: Plank[]): number {
  const widest = Math.max(...planks.map((p) => p.w + 8));
  return Math.min(1.2, 216 / widest);
}

/** Nom affiché d'un groupe : celui enregistré, sinon « Boîte k » (boîte créée avant que son nom soit enregistré) ou « Groupe ». */
export function groupName(sc: PlankScene, g: string, members: Plank[]): string {
  const face = members.map((m) => /^Face avant (\d+)/.exec(m.name)).find(Boolean);
  return (sc.groupNames?.[g] ?? (face ? `Boîte ${face[1]}` : 'Groupe')).replace(/ \(.*\)$/, '');
}
