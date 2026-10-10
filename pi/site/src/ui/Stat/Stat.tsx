import type { StatProps } from './types';
import './Stat.css';

/** Grande valeur de capteur avec son unité. `id` sert au simulateur de l'app. */
export function Stat({ id, value, unit }: StatProps) {
  return <div className="val"><span id={id}>{value}</span> <small>{unit}</small></div>;
}
