import type { TerminalLine } from '../../ui';
import type { LogEntry } from '../../grbl';

/** Entrées du journal → lignes du terminal (statuts `?` masqués sauf demande). */
export function toTerminal(log: LogEntry[], showPolls: boolean): TerminalLine[] {
  return log
    .filter((e) => showPolls || !e.poll)
    .map((e) => ({
      id: e.id,
      text: `${e.dir === 'tx' ? '> ' : e.dir === 'rx' ? '< ' : '* '}${e.text}`,
      tone: e.dir === 'tx' ? 'out' : e.dir === 'info' ? 'info' : /^(error|ALARM)/.test(e.text) ? 'error' : 'in',
    }));
}
