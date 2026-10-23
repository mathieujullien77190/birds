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

/** Commande de la console : seules les commandes système (`$I`, `$$`, `$s`, `$Light/Duty=…`) passent, jamais de G-code ni de M-code (pas de tir possible depuis la console). Renvoie la ligne nettoyée ou `null`. */
export function consoleCommand(text: string): string | null {
  const line = text.trim();
  return /^\$[A-Za-z0-9$#/=._-]*$/.test(line) && !/^\$J=/i.test(line) ? line : null;
}
