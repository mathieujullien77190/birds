import { Btn, Chip, Hint } from '@/ui';
import { formatDuration } from '../../grbl';
import type { LaserMachine } from '../../hooks/useLaserMachine';

/** Cadre à vide : la tête suit le rectangle des pièces (ou de la planche), laser éteint (M5, déplacements $J= sans puissance). */
export function FramePanel({ m }: { m: LaserMachine }) {
  const { settings, setSettings, frame } = m;
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-stone-600">
        Cadre
        <Chip active={settings.frameMode === 'pieces'} onClick={() => setSettings({ ...settings, frameMode: 'pieces' })}>Autour des pièces</Chip>
        <Chip active={settings.frameMode === 'sheet'} onClick={() => setSettings({ ...settings, frameMode: 'sheet' })}>Planche entière</Chip>
      </div>
      <Btn variant="primary" disabled={!m.canFrame} onClick={() => frame && m.job.start('frame', frame)}>
        Tracer le cadre à vide{frame ? ` (${formatDuration(frame.stats.seconds)})` : ''}
      </Btn>
      <Hint>Le laser reste éteint : la machine reçoit M5 puis des déplacements $J= qui ne peuvent pas allumer le laser. Vérifie que le rectangle tombe bien sur ton matériau. Le bouton Arrêt reste disponible.</Hint>
    </div>
  );
}
