import { Section, Slider } from '@/ui';
import { recastAll } from '@/planks/model';
import type { PlankScene } from '@/planks/model';
import type { Commit } from '../../types';

/** Section « Bois » : épaisseur commune de toutes les plaques (les crénelages sont refaits). */
export function WoodSection({ sc, commit }: { sc: PlankScene; commit: Commit }) {
  return (
    <Section title="Bois" defaultOpen note={`${sc.t} mm`}>
      <Slider label="Épaisseur de toutes les plaques" value={sc.t} min={1} max={30} step={0.5} unit=" mm" onChange={(t) => commit('Épaisseur', (s) => ({ ...s, t, planks: s.planks.map((p) => recastAll(p, t, s.fit)) }))} />
    </Section>
  );
}
