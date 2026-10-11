import { Emitter } from './emitter';
import { alarmMessage, errorMessage } from './errors';
import { isWelcome, parseSetting, parseStatus } from './status';
import { RT, RX_BUFFER, type GrblResponse, type GrblStatus, type GrblTransport, type LogEntry, type Vec3 } from './types';

interface Pending { len: number; cb: (r: GrblResponse) => void }

export interface ClientOptions {
  /** Intervalle d'interrogation `?` (ms). */
  pollMs?: number;
  /** Tampon de réception visé pour le comptage de caractères (octets). */
  bufferSize?: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Dialogue avec un contrôleur GRBL 1.1 au-dessus d'une `GrblTransport` : découpe le flux en lignes, associe chaque `ok` / `error:N`
 * à la ligne envoyée (file FIFO, comptage des octets en attente pour le protocole « character counting »), lit les rapports d'état
 * et les réglages. Rien n'est envoyé tout seul à part l'interrogation `?` et la lecture `$$` à la première réponse.
 */
export class GrblClient {
  status: GrblStatus | null = null;
  settings: Record<number, number> = {};
  connected = false;
  readonly onStatus = new Emitter<GrblStatus>();
  readonly onLog = new Emitter<LogEntry>();
  readonly onClosed = new Emitter<{ unexpected: boolean; reason?: string }>();
  readonly onAlarm = new Emitter<number>();
  /** Message GRBL (`[MSG:…]`), erreur sans ligne en attente, etc. */
  readonly onNotice = new Emitter<string>();
  readonly onSettings = new Emitter<Record<number, number>>();
  /** Le contrôleur vient de démarrer ou de se réinitialiser (message `Grbl 1.1h`). */
  readonly onWelcome = new Emitter<void>();

  private pending: Pending[] = [];
  private pendingBytes = 0;
  private buf = '';
  private wco: Vec3 = { x: 0, y: 0, z: 0 };
  private poll: ReturnType<typeof setInterval> | null = null;
  private logId = 0;
  private settingsAsked = false;
  private readonly pollMs: number;
  private readonly bufferSize: number;

  constructor(readonly transport: GrblTransport, opt: ClientOptions = {}) {
    this.pollMs = opt.pollMs ?? 250;
    this.bufferSize = opt.bufferSize ?? RX_BUFFER;
  }

  /** Ouvre la liaison (le choix du port exige un clic de l'utilisateur : à appeler directement dans le gestionnaire du clic). */
  async connect(): Promise<void> {
    this.transport.onData = (chunk) => this.receive(chunk);
    this.transport.onClose = (unexpected, reason) => this.closed(unexpected, reason);
    await this.transport.open();
    this.connected = true;
    this.log('info', `Connecté : ${this.transport.label}`);
    this.poll = setInterval(() => { void this.write(RT.status, true); }, this.pollMs);
    void this.write(RT.status, true);
  }

  /** Ferme proprement la liaison (à la demande de l'utilisateur). */
  async disconnect(): Promise<void> {
    if (!this.connected) return;
    this.stopPoll();
    this.connected = false;
    try { await this.transport.close(); } catch { /* déjà fermée */ }
    this.flushPending('Liaison fermée.');
    this.log('info', 'Déconnecté.');
    this.onClosed.emit({ unexpected: false });
  }

  private closed(unexpected: boolean, reason?: string) {
    if (!this.connected) return;
    this.stopPoll();
    this.connected = false;
    this.flushPending('Liaison perdue.');
    this.log('info', unexpected ? `Liaison perdue${reason ? ` (${reason})` : ''}.` : 'Déconnecté.');
    this.onClosed.emit({ unexpected, reason });
  }

  private stopPoll() { if (this.poll) { clearInterval(this.poll); this.poll = null; } }

  private flushPending(message: string) {
    const p = this.pending;
    this.pending = [];
    this.pendingBytes = 0;
    for (const x of p) x.cb({ ok: false, code: null, message });
  }

  private log(dir: LogEntry['dir'], text: string, poll = false) {
    this.onLog.emit({ id: ++this.logId, dir, text, poll: poll || undefined });
  }

  private async write(data: string, poll = false): Promise<boolean> {
    if (!this.connected) return false;
    try {
      await this.transport.write(data);
      if (!poll) this.log('tx', data.replace('\n', ''));
      return true;
    } catch (e) {
      this.closed(true, e instanceof Error ? e.message : 'écriture impossible');
      return false;
    }
  }

  /** Commande temps réel (1 octet, hors tampon) : `!`, `~`, 0x18, 0x85. */
  async realtime(c: string): Promise<void> {
    const names: Record<string, string> = { '!': '! (pause)', '~': '~ (reprise)', '\x18': '0x18 (réinitialisation douce)', '\x85': '0x85 (annulation du déplacement)' };
    if (c === RT.reset) this.flushPending('Réinitialisation.');
    await this.write(c, true);
    this.log('tx', names[c] ?? c);
  }

  /**
   * Met une ligne en file si elle tient dans le tampon de GRBL (octets en attente + ligne + saut de ligne ≤ taille du tampon) ;
   * `cb` est appelée avec la réponse (`ok` ou `error:N`). Rend `false` sans rien envoyer s'il n'y a pas la place.
   */
  queueLine(line: string, cb: (r: GrblResponse) => void): boolean {
    if (!this.connected) { cb({ ok: false, code: null, message: 'Machine non connectée.' }); return true; }
    const len = line.length + 1;
    if (this.pendingBytes + len > this.bufferSize && this.pending.length > 0) return false;
    this.pending.push({ len, cb });
    this.pendingBytes += len;
    void this.write(line + '\n');
    return true;
  }

  /** Envoie une ligne et attend sa réponse (délai de 6 s par défaut). */
  send(line: string, timeoutMs = 6000): Promise<GrblResponse> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (r: GrblResponse) => { if (!done) { done = true; clearTimeout(timer); resolve(r); } };
      const timer = setTimeout(() => finish({ ok: false, code: null, message: 'Pas de réponse de la machine.' }), timeoutMs);
      if (!this.queueLine(line, finish)) finish({ ok: false, code: null, message: 'Tampon de la machine plein : réessaie.' });
    });
  }

  /** Octets de lignes envoyées et pas encore acquittées (≤ taille du tampon). */
  get pendingCount(): number { return this.pendingBytes; }
  get pendingLines(): number { return this.pending.length; }

  /** Lit les réglages `$$` (la réponse met à jour `settings`). */
  async readSettings(): Promise<GrblResponse> { return this.send('$$'); }

  /**
   * Arrêt d'urgence logiciel : pause `!` (le laser s'éteint aussitôt), puis réinitialisation douce 0x18 (les lignes en attente sont abandonnées),
   * puis `M5`. GRBL éteint le laser à la réinitialisation ; `M5` refusé en alarme (error:9) est sans importance.
   */
  async emergencyStop(): Promise<void> {
    await this.realtime(RT.hold);
    await sleep(120);
    await this.realtime(RT.reset);
    await sleep(500);
    if (this.connected) await this.send('M5', 2000);
  }

  // ----- réception -----

  private receive(chunk: string) {
    this.buf += chunk;
    let i: number;
    while ((i = this.buf.search(/[\r\n]/)) >= 0) {
      const line = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      if (line) this.line(line);
    }
  }

  private answer(r: GrblResponse) {
    const p = this.pending.shift();
    if (!p) return;
    this.pendingBytes = Math.max(0, this.pendingBytes - p.len);
    p.cb(r);
  }

  private line(line: string) {
    if (line === 'ok') { this.log('rx', line); this.answer({ ok: true }); return; }
    let m = /^error:(\d+)/.exec(line);
    if (m) {
      const code = Number(m[1]);
      this.log('rx', `${line} — ${errorMessage(code)}`);
      this.answer({ ok: false, code, message: errorMessage(code) });
      return;
    }
    m = /^ALARM:(\d+)/.exec(line);
    if (m) {
      const code = Number(m[1]);
      this.log('rx', `${line} — ${alarmMessage(code)}`);
      this.onAlarm.emit(code);
      return;
    }
    if (line.startsWith('<')) {
      const st = parseStatus(line, this.wco);
      this.log('rx', line, true);
      if (st) {
        this.wco = st.wco;
        this.status = st;
        this.onStatus.emit(st);
        if (!this.settingsAsked) { this.settingsAsked = true; void this.readSettings(); } // lecture seule, une fois, à la première réponse
      }
      return;
    }
    this.log('rx', line);
    if (isWelcome(line)) {
      this.flushPending('Le contrôleur s\'est réinitialisé.');
      this.settingsAsked = false;
      this.onWelcome.emit();
      return;
    }
    const s = parseSetting(line);
    if (s) { this.settings = { ...this.settings, [s[0]]: s[1] }; this.onSettings.emit(this.settings); return; }
    if (line.startsWith('[MSG:')) this.onNotice.emit(line.slice(5, -1));
  }
}
