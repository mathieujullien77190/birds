import type { StatusTone } from '@/ui';
import { stateLabel } from '../../grbl';
import type { Grbl } from '../../hooks/useGrbl';

export interface Indicator { tone: StatusTone; label: string; pulse: boolean }

/** Couleur et libellé de l'état de la liaison / de la machine. */
export function indicator(g: Grbl): Indicator {
  if (g.conn === 'connecting') return { tone: 'busy', label: 'Connexion…', pulse: true };
  if (!g.connected) return { tone: g.linkLost ? 'error' : 'off', label: stateLabel(null, false), pulse: !!g.linkLost };
  const s = g.status;
  const label = stateLabel(s, true);
  switch (s?.state) {
    case 'Idle': return { tone: 'ok', label, pulse: false };
    case 'Run': case 'Jog': case 'Home': return { tone: 'busy', label, pulse: true };
    case 'Hold': return { tone: 'warn', label, pulse: false };
    case 'Alarm': case 'Door': return { tone: 'error', label, pulse: true };
    default: return { tone: 'idle', label, pulse: false };
  }
}

export const mm = (n: number | undefined) => (n === undefined ? '—' : n.toFixed(2));
