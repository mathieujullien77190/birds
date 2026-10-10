import type { GaugeProps } from './types';
import './Gauge.css';

/** Jauge horizontale : `ratio` entre 0 et 1, `color` = couleur de remplissage. */
export function Gauge({ ratio, color, height = 12 }: GaugeProps) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <div className="gauge" style={{ height }}>
      <div className="gauge-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
