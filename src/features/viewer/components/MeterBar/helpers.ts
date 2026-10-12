import { formatMm, type MeterReading } from '@/birdhouse/three/interactions/meter';

/** Texte du bandeau du mètre : consigne tant qu'il manque un point, distance ensuite (« … » tant que le second point n'est pas posé). */
export function meterText(reading: MeterReading | null): string {
  if (!reading) return 'Mètre : clique un premier point sur une pièce (il s\'aimante aux coins).';
  return reading.done ? `Distance : ${formatMm(reading.mm)}` : `${formatMm(reading.mm)} … clique le second point`;
}
