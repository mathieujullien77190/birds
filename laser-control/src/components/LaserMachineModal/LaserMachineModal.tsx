import { useState, type ReactNode } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { IconButton, Section, StatusDot } from '../../ui';
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
import { Webcam } from '../Webcam';

/** Contenu du pilotage de la laser : connexion, déplacements, cadre, réglages, aperçu, envoi, journal. `top` = blocs ajoutés en haut de la colonne de gauche (fichiers…). */
export function LaserPanel({ m, top }: { m: LaserMachine; top?: ReactNode }) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 lg:grid-cols-[22rem_1fr]">
      <div className="space-y-2.5">
        {top}
        <Section title="Connexion" defaultOpen><ConnectionBar m={m} /></Section>
        <Section title="Déplacements et origine" defaultOpen><JogPad m={m} /></Section>
        <Section title="Cadre à vide" defaultOpen><FramePanel m={m} /></Section>
        <Section title="Réglages de coupe" defaultOpen><CutSettings m={m} /></Section>
      </div>
      <div className="min-w-0 space-y-2.5">
        <Section title="Caméra de la machine"><Webcam /></Section>
        <Section title="Aperçu du trajet" defaultOpen><GcodePreview m={m} /></Section>
        <Section title="Envoi à la machine" defaultOpen><SendPanel m={m} /></Section>
        <GrblConsole grbl={m.grbl} />
      </div>
    </div>
  );
}

/** Fenêtre « Pilotage de la laser » (Sculpfun E1 Pro 21 W, GRBL 1.1, Web Serial). Le bouton ▾ l'abaisse en barre au bas de l'écran (le modèle 3D reste visible et manipulable, la machine continue), ▴ la remonte. */
export function LaserMachineModal({ m }: { m: LaserMachine }) {
  const [lowered, setLowered] = useState(false);
  const ind = indicator(m.grbl);
  useEscapeKey(() => m.setOpen(false));
  return (
    <div className={`fixed inset-0 z-50 flex justify-center p-4 ${lowered ? 'pointer-events-none items-end' : 'items-center bg-stone-900/60'}`} onClick={() => !lowered && m.setOpen(false)}>
      <div className={`pointer-events-auto flex w-full max-w-7xl flex-col rounded-xl bg-white shadow-2xl ${lowered ? '' : 'max-h-full'}`} onClick={(e) => e.stopPropagation()}>
        <div className={`flex items-center justify-between px-5 py-3 ${lowered ? '' : 'border-b border-stone-200'}`}>
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-semibold text-stone-800">Pilotage de la laser</h2>
            <StatusDot tone={ind.tone} pulse={ind.pulse}>{ind.label}</StatusDot>
            {m.job.running && <StopButton onStop={() => void m.job.stop()} />}
          </div>
          <div className="flex items-center gap-1">
            <IconButton size="lg" onClick={() => setLowered((v) => !v)} title={lowered ? 'Remonter la fenêtre' : 'Abaisser la fenêtre (voir le modèle 3D)'}>{lowered ? '▴' : '▾'}</IconButton>
            <IconButton size="lg" onClick={() => m.setOpen(false)} title="Fermer (Échap)">×</IconButton>
          </div>
        </div>
        <div className={lowered ? 'hidden' : 'flex min-h-0 flex-1 flex-col'}><LaserPanel m={m} /></div>
      </div>
    </div>
  );
}
