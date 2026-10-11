import { cleanLine } from './gcode';
import type { GrblResponse } from './types';

/** Ce dont l'envoyeur a besoin du client : mettre une ligne en file (faux = plus de place dans le tampon). */
export interface StreamHost { queueLine(line: string, cb: (r: GrblResponse) => void): boolean }

export type StreamPhase = 'idle' | 'running' | 'paused' | 'draining' | 'done' | 'error' | 'aborted';

export interface StreamSnapshot {
  phase: StreamPhase;
  total: number;
  /** Lignes envoyées à la machine. */
  sent: number;
  /** Lignes acquittées par la machine (`ok`). */
  acked: number;
  /** Première erreur rencontrée. */
  error: { line: number; text: string; message: string } | null;
}

/**
 * Envoi d'un programme en flux, protocole « character counting » : on envoie autant de lignes que le tampon de GRBL peut en contenir
 * (le client compte les octets en attente d'`ok`), et chaque `ok` libère de la place pour la suivante. S'arrête à la première erreur.
 */
export class GcodeStreamer {
  readonly lines: string[];
  private phase: StreamPhase = 'idle';
  private next = 0;
  private acked = 0;
  private error: StreamSnapshot['error'] = null;
  onChange: ((s: StreamSnapshot) => void) | null = null;

  constructor(private host: StreamHost, lines: string[]) {
    this.lines = lines.map(cleanLine).filter(Boolean);
  }

  snapshot(): StreamSnapshot { return { phase: this.phase, total: this.lines.length, sent: this.next, acked: this.acked, error: this.error }; }
  private change(phase?: StreamPhase) { if (phase) this.phase = phase; this.onChange?.(this.snapshot()); }

  start(): void {
    if (this.phase !== 'idle') return;
    if (!this.lines.length) { this.change('done'); return; }
    this.change('running');
    this.pump();
  }

  /** Cesse d'envoyer de nouvelles lignes (la machine, elle, est mise en pause par `!` côté appelant). */
  pause(): void { if (this.phase === 'running') this.change('paused'); }

  resume(): void {
    if (this.phase !== 'paused') return;
    if (this.acked >= this.lines.length) { this.change('draining'); return; }
    this.change('running');
    this.pump();
  }

  /** Abandonne (arrêt, alarme, liaison perdue) : plus rien n'est envoyé. */
  abort(error?: { text: string; message: string }): void {
    if (this.phase === 'done' || this.phase === 'aborted' || this.phase === 'error') return;
    if (error) this.error = { line: this.acked + 1, ...error };
    this.change(error ? 'error' : 'aborted');
  }

  /** La machine est inactive : si tout est acquitté, le programme est vraiment terminé (les mouvements ont fini). */
  machineIdle(): void { if (this.phase === 'draining') this.change('done'); }

  private pump() {
    while (this.phase === 'running' && this.next < this.lines.length) {
      const idx = this.next;
      const ok = this.host.queueLine(this.lines[idx], (r) => this.answer(idx, r));
      if (!ok) break;
      this.next++;
    }
    this.onChange?.(this.snapshot());
  }

  private answer(idx: number, r: GrblResponse) {
    if (this.phase === 'aborted' || this.phase === 'error' || this.phase === 'done') return;
    this.acked++;
    if (!r.ok) {
      // une ligne refusée : on arrête d'envoyer ; l'appelant met la machine en pause
      this.error = { line: idx + 1, text: this.lines[idx], message: r.code !== null ? `error:${r.code} — ${r.message}` : r.message };
      this.change('error');
      return;
    }
    if (this.acked >= this.lines.length) { this.change(this.phase === 'paused' ? 'paused' : 'draining'); return; }
    if (this.phase === 'running') this.pump(); else this.change();
  }
}
