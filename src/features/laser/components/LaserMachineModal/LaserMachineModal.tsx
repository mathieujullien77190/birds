import { Modal, Section, StatusDot } from '@/ui';
import type { LaserMachine } from '../../hooks/useLaserMachine';
import { ConnectionBar } from '../ConnectionBar';
import { indicator } from '../ConnectionBar/helpers';
import { CutSettings } from '../CutSettings';
import { FramePanel } from '../FramePanel';
import { GcodePreview } from '../GcodePreview';
import { GrblConsole } from '../GrblConsole';
import { JogPad } from '../JogPad';
import { SendPanel } from '../SendPanel';
import { StopButton } from '../StopButton';
import { TestCard } from '../TestCard';

/** Fenêtre « Pilotage de la laser » (Sculpfun S30 Pro, GRBL 1.1, Web Serial) : connexion, déplacements, cadre, réglages, aperçu, envoi. */
export function LaserMachineModal({ m }: { m: LaserMachine }) {
  const ind = indicator(m.grbl);
  return (
    <Modal
      maxWidth="max-w-7xl"
      onClose={() => m.setOpen(false)}
      header={
        <div className="flex items-center gap-4">
          <h2 className="text-sm font-semibold text-stone-800">Pilotage de la laser</h2>
          <StatusDot tone={ind.tone} pulse={ind.pulse}>{ind.label}</StatusDot>
          {m.job.running && <StopButton onStop={() => void m.job.stop()} />}
        </div>
      }
    >
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 lg:grid-cols-[22rem_1fr]">
        <div className="space-y-2.5">
          <Section title="Connexion" defaultOpen><ConnectionBar m={m} /></Section>
          <Section title="Déplacements et origine" defaultOpen><JogPad m={m} /></Section>
          <Section title="Cadre à vide" defaultOpen><FramePanel m={m} /></Section>
          <Section title="Réglages de coupe" defaultOpen><CutSettings m={m} /></Section>
          <Section title="Planche d'essai"><TestCard m={m} /></Section>
        </div>
        <div className="min-w-0 space-y-2.5">
          <Section title="Aperçu du trajet" defaultOpen><GcodePreview m={m} /></Section>
          <Section title="Envoi à la machine" defaultOpen><SendPanel m={m} /></Section>
          <GrblConsole grbl={m.grbl} />
        </div>
      </div>
    </Modal>
  );
}
