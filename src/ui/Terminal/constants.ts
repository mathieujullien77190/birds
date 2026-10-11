export type TerminalTone = 'out' | 'in' | 'info' | 'error';

export interface TerminalLine { id: number; text: string; tone: TerminalTone }

export const TONES: Record<TerminalTone, string> = {
  out: 'text-sky-300',
  in: 'text-stone-200',
  info: 'text-amber-300',
  error: 'text-rose-400',
};
