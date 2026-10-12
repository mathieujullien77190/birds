import { Btn, Hint, ProgressBar, Section, StatusDot } from '../../ui';
import type { LaserMachine } from '../../hooks/useLaserMachine';
import { indicator } from '../ConnectionBar/helpers';
import { StopButton } from '../StopButton';

/** Bloc repliable du pilotage de la laser : état de la laser, accès à la fenêtre de pilotage, avancement et Arrêt pendant un envoi. Sous-bloc de « Découpe laser » par défaut (titre « Machine … »), ou bloc à part entière (`title`, `defaultOpen`). */
export function MachineSection({ m, title = 'Machine (laser Sculpfun)', defaultOpen = false }: { m: LaserMachine; title?: string; defaultOpen?: boolean }) {
  const ind = indicator(m.grbl);
  const snap = m.job.view.snap;
  return (
    <Section title={title} defaultOpen={defaultOpen} note={ind.label}>
      <div className="flex items-center justify-between">
        <StatusDot tone={ind.tone} pulse={ind.pulse}>{ind.label}</StatusDot>
        {m.grbl.kind === 'mock' && <span className="text-[10px] text-stone-400">simulée</span>}
      </div>
      {m.job.running && snap && (
        <div className="space-y-2">
          <ProgressBar value={snap.total ? snap.acked / snap.total : 0} label={`${snap.acked} / ${snap.total} lignes`} />
          <StopButton className="w-full" onStop={() => void m.job.stop()} />
        </div>
      )}
      <Btn variant="primary" onClick={() => m.setOpen(true)}>Ouvrir l'application</Btn>
      <Hint>Connexion USB (Chrome ou Edge), déplacements, cadre à vide, envoi du G-code planche par planche. « Machine simulée » pour essayer sans laser.</Hint>
    </Section>
  );
}
