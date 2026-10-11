import type { Fan } from '@/types';

const MODES: Record<Fan['mode'], string> = { arret: 'arrêté', manuel: 'à la main', auto: 'automatique' };

/** « 60 % · 1920 tr/min · automatique » (tr/min omis sans tachymètre). */
export function describeFan(f: Fan | undefined): string {
  if (!f) return '—';
  if (!f.alimente) return 'coupé (12 V)';
  const rpm = f.rpm === null ? '' : ` · ${f.rpm} tr/min`;
  return `${f.pourcent} %${rpm} · ${MODES[f.mode]}`;
}
