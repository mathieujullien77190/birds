import type { ReactNode } from 'react';
import { TONES, type StatusTone } from './constants';

/** Pastille d'état colorée avec son libellé (connecté, en marche, alarme…). `pulse` = clignote. */
export function StatusDot({ tone = 'idle', pulse = false, children }: { tone?: StatusTone; pulse?: boolean; children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-700">
      <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-full ${TONES[tone]} ${pulse ? 'animate-pulse' : ''}`} />
      {children}
    </span>
  );
}
