import type { ReactNode } from 'react';
import { Section } from '../../ui';
import type { LaserMachine } from '../../hooks/useLaserMachine';
import { MachineSection } from '../MachineSection';

/**
 * Section « Découpe laser » d'un panneau latéral : le contenu propre à l'application (taille de la planche, liste des planches, boutons SVG…)
 * en `children`, suivi (sauf `hideMachine`) du bloc « Machine » (état de la laser, ouverture du pilotage, avancement et Arrêt).
 */
export function LaserSection({ machine, note, children, title = 'Découpe laser', hideMachine = false }: { machine: LaserMachine; note?: string; children?: ReactNode; title?: string; hideMachine?: boolean }) {
  return (
    <Section title={title} defaultOpen note={note}>
      {children}
      {!hideMachine && <MachineSection m={machine} />}
    </Section>
  );
}
