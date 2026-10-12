import { Btn, FloatingPanel } from '@/ui';
import { formatMm, type MeterReading } from '@/birdhouse/three/interactions/meter';
import { meterText } from './helpers';

/** Bandeau du mètre ruban, en haut au centre de la vue : consigne tant qu'il manque un point, puis la distance et les écarts par axe. */
export function MeterBar({ reading, onDone }: { reading: MeterReading | null; onDone: () => void }) {
  return (
    <FloatingPanel tone="sky" className="absolute top-16 left-1/2 flex -translate-x-1/2 items-center gap-2 px-2.5 py-1.5 text-[11px] text-sky-800">
      <span aria-live="polite" className={reading ? 'text-sm font-semibold text-rose-700' : ''}>{meterText(reading)}</span>
      {reading && <span className="text-stone-500">X {formatMm(reading.dx)} · Y {formatMm(reading.dy)} · Z {formatMm(reading.dz)}</span>}
      <Btn block={false} variant="ghost" onClick={onDone}>Terminer</Btn>
    </FloatingPanel>
  );
}
