export type StatusTone = 'off' | 'idle' | 'ok' | 'busy' | 'warn' | 'error';

export const TONES: Record<StatusTone, string> = {
  off: 'bg-stone-300',
  idle: 'bg-sky-500',
  ok: 'bg-emerald-500',
  busy: 'bg-amber-500',
  warn: 'bg-orange-500',
  error: 'bg-rose-600',
};
