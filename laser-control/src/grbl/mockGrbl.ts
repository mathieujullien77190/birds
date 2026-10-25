import type { GrblState, GrblTransport } from './types';

/** Zone de la machine simulée (mm). */
const AREA = { x: 400, y: 320 };
/** Blocs de mouvement que le planificateur de GRBL garde en avance. */
const PLANNER = 15;
const RX = 127;

interface Block { tx: number; ty: number; feed: number; rapid: boolean; s: number; jog: boolean; dwell: number }

export interface MockOptions {
  /** `$32` au démarrage (1 = mode laser). */
  laserMode?: boolean;
  /** Vitesse rapide ($110 / $111, mm/min). */
  rapid?: number;
}

/**
 * Contrôleur GRBL 1.1h simulé : reçoit des caractères, répond comme le vrai (`Grbl 1.1h ['$' for help]`, `ok`, `error:N`, `<Idle|MPos…>`,
 * `$$`, `$J=`, `!`, `~`, 0x18, 0x85, alarmes, mode laser) et déplace une tête virtuelle à la vitesse demandée.
 * Le temps avance par `step(dt)` : l'appelant fournit l'horloge (réelle, accélérée ou simulée dans les tests).
 */
export class MockGrbl {
  /** Sortie du contrôleur (vers l'application). */
  out: (text: string) => void = () => {};
  mpos = { x: 0, y: 0 };
  wco = { x: 0, y: 0 };
  settings: Record<number, number>;
  alarm: number | null = null;
  /** Octets maximum vus en attente d'`ok` (pour vérifier le comptage de caractères) ; dépassement = tampon de 127 débordé. */
  maxPending = 0;
  overflowed = false;
  /** Plus grande valeur S vue sur une ligne, et plus grande valeur réellement sortie sur le laser. */
  maxSSeen = 0;
  maxSOut = 0;
  /** Lignes G-code exécutées, dans l'ordre (pour les tests). */
  executed: string[] = [];

  private queue: Block[] = [];
  private incoming: string[] = [];
  private pendingBytes = 0;
  private lineBuf = '';
  private cursor = { x: 0, y: 0 };
  private modal = { rel: false, motion: 'G0', feed: 0, s: 0, spindle: 'M5' };
  private hold: 'none' | 'braking' | 'held' = 'none';
  private holdLeft = 0;
  private reports = 0;
  private rapid: number;

  constructor(opt: MockOptions = {}) {
    this.rapid = opt.rapid ?? 6000;
    this.settings = { 0: 10, 1: 25, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 10: 1, 11: 0.01, 12: 0.002, 13: 0, 20: 0, 21: 0, 22: 0, 23: 0, 24: 25, 25: 500, 26: 250, 27: 1, 30: 1000, 31: 0, 32: opt.laserMode === false ? 0 : 1, 100: 80, 101: 80, 102: 250, 110: this.rapid, 111: this.rapid, 112: 500, 120: 500, 121: 500, 122: 10, 130: AREA.x, 131: AREA.y, 132: 200 };
  }

  /** Démarrage du contrôleur : message de bienvenue. */
  powerUp() { this.out("\r\nGrbl 1.1h ['$' for help]\r\n"); }

  /** Caractères reçus de l'application. */
  receive(text: string) {
    for (const ch of text) {
      if (ch === '?') this.report();
      else if (ch === '!') this.feedHold();
      else if (ch === '~') this.cycleStart();
      else if (ch === '\x18') this.softReset();
      else if (ch === '\x85') this.jogCancel();
      else if (ch === '\n' || ch === '\r') {
        const line = this.lineBuf.trim();
        if (this.lineBuf.length) {
          if (line) { this.incoming.push(line); this.pendingBytes += this.lineBuf.length + 1; this.maxPending = Math.max(this.maxPending, this.pendingBytes); if (this.pendingBytes > RX) this.overflowed = true; }
          this.lineBuf = '';
        }
      } else this.lineBuf += ch;
    }
    this.processIncoming();
  }

  /** Simule une alarme (limite, etc.). */
  triggerAlarm(code: number) {
    this.queue = [];
    this.hold = 'none';
    this.modal.spindle = 'M5';
    this.alarm = code;
    this.out(`ALARM:${code}\r\n`);
  }

  get state(): GrblState {
    if (this.alarm !== null) return 'Alarm';
    if (this.hold !== 'none') return 'Hold';
    if (this.queue.length) return this.queue[0].jog ? 'Jog' : 'Run';
    return 'Idle';
  }

  /** Valeur S réellement sortie sur le laser à cet instant. */
  get spindleOut(): number {
    if (this.alarm !== null || this.hold !== 'none') return 0;
    const b = this.queue[0];
    return b && !b.jog && b.s > 0 ? Math.min(b.s, this.settings[30]) : 0;
  }

  /** Fait avancer la machine de `dt` secondes. */
  step(dt: number) {
    if (this.hold === 'braking') { this.holdLeft -= dt; if (this.holdLeft <= 0) this.hold = 'held'; return; }
    if (this.hold === 'held' || this.alarm !== null) return;
    let left = dt;
    while (left > 0 && this.queue.length) {
      const b = this.queue[0];
      if (b.dwell > 0) { const used = Math.min(left, b.dwell); b.dwell -= used; left -= used; if (b.dwell <= 1e-9) this.queue.shift(); continue; }
      const dx = b.tx - this.mpos.x, dy = b.ty - this.mpos.y, dist = Math.hypot(dx, dy);
      const v = (b.rapid ? this.rapid : b.feed) / 60;
      if (dist < 1e-9) { this.queue.shift(); continue; }
      const need = dist / v;
      this.maxSOut = Math.max(this.maxSOut, this.spindleOut);
      if (need <= left) { this.mpos = { x: b.tx, y: b.ty }; left -= need; this.queue.shift(); }
      else { const f = (v * left) / dist; this.mpos = { x: this.mpos.x + dx * f, y: this.mpos.y + dy * f }; left = 0; }
    }
    this.processIncoming();
  }

  // ----- temps réel -----

  private report() {
    const b = this.queue[0];
    const moving = this.state === 'Run' || this.state === 'Jog';
    const feed = moving && b ? (b.rapid ? this.rapid : b.feed) : 0;
    const sub = this.state === 'Hold' ? `:${this.hold === 'held' ? 0 : 1}` : '';
    const f = (n: number) => n.toFixed(3);
    let s = `<${this.state}${sub}|MPos:${f(this.mpos.x)},${f(this.mpos.y)},0.000|FS:${Math.round(feed)},${Math.round(this.spindleOut)}`;
    if (this.reports++ % 10 === 0) s += `|WCO:${f(this.wco.x)},${f(this.wco.y)},0.000`;
    this.out(s + '>\r\n');
  }

  private feedHold() { if (this.hold === 'none' && this.alarm === null && this.queue.length) { this.hold = 'braking'; this.holdLeft = 0.15; } }
  private cycleStart() { if (this.hold !== 'none') this.hold = 'none'; }
  private jogCancel() { if (this.queue[0]?.jog) { this.queue = []; this.hold = 'none'; this.cursor = { ...this.mpos }; } }

  private softReset() {
    const moving = this.state === 'Run' || this.state === 'Jog' || this.state === 'Hold';
    this.queue = []; this.incoming = []; this.pendingBytes = 0; this.lineBuf = ''; this.hold = 'none';
    this.cursor = { ...this.mpos };
    this.modal = { rel: false, motion: 'G0', feed: 0, s: 0, spindle: 'M5' };
    this.powerUp();
    if (moving) { this.alarm = 3; this.out('ALARM:3\r\n[MSG:Reset while in motion]\r\n'); }
    else if (this.alarm !== null) this.out("[MSG:'$H'|'$X' to unlock]\r\n");
  }

  // ----- lignes -----

  private processIncoming() {
    while (this.incoming.length) {
      const line = this.incoming[0];
      const system = line.startsWith('$');
      if (!system && this.queue.length >= PLANNER) break; // planificateur plein : GRBL ne répond `ok` qu'à la place libérée
      this.incoming.shift();
      this.pendingBytes = Math.max(0, this.pendingBytes - (line.length + 1));
      this.out(this.execute(line));
    }
  }

  private execute(raw: string): string {
    const line = raw.replace(/\(.*?\)/g, '').replace(/;.*$/, '').trim().toUpperCase();
    if (!line) return 'ok\r\n';
    if (line.length > 80) return 'error:11\r\n';
    if (line.startsWith('$')) return this.system(line);
    if (this.alarm !== null) return 'error:9\r\n';
    const sm = /S(-?\d*\.?\d+)/.exec(line);
    if (sm) this.maxSSeen = Math.max(this.maxSSeen, Number(sm[1]));
    const words = [...line.matchAll(/([A-Z])\s*(-?\d*\.?\d+)/g)].map((m) => ({ c: m[1], v: Number(m[2]) }));
    if (words.length === 0 || line.replace(/([A-Z])\s*(-?\d*\.?\d+)\s*/g, '').length) return 'error:1\r\n';
    return this.gcode(words, line);
  }

  private gcode(words: { c: string; v: number }[], line: string, jog = false): string {
    const w = (c: string) => words.find((x) => x.c === c)?.v;
    let target = { x: this.cursor.x, y: this.cursor.y };
    let rel = this.modal.rel;
    let motion = this.modal.motion;
    let spindle = this.modal.spindle;
    let doMove = false, dwell = 0, offset: 'g10' | 'g92' | null = null;
    for (const { c, v } of words) {
      if (c === 'G') {
        if (v === 0 || v === 1) motion = `G${v}`;
        else if (v === 90) rel = false;
        else if (v === 91) rel = true;
        else if (v === 4) dwell = (w('P') ?? 0);
        else if (v === 10) offset = 'g10';
        else if (v === 92) offset = 'g92';
        else if (![21, 54, 94, 53].includes(v)) return 'error:20\r\n';
      } else if (c === 'M') {
        if (v === 3 || v === 4 || v === 5) spindle = `M${v}`;
        else if (v === 2 || v === 30) spindle = 'M5';
        else if (v !== 8 && v !== 9) return 'error:20\r\n';
      } else if (!'XYZFSPLN'.includes(c)) return 'error:1\r\n';
    }
    if (offset) {
      if (offset === 'g10' && ((w('L') !== 20 && w('L') !== 2) || w('P') === undefined)) return 'error:2\r\n'; // L20 : la position actuelle devient X Y ; L2 : X Y sont les coordonnées MACHINE de l'origine de travail
      this.settleBeforeOffset();
      this.reports = 0; // GRBL joint le WCO au prochain rapport après un changement d'origine
      const abs = offset === 'g10' && w('L') === 2; // L2 : le décalage est donné en coordonnées machine, la position de la tête ne compte pas
      if (w('X') !== undefined) this.wco.x = abs ? (w('X') as number) : this.mpos.x - (w('X') as number);
      if (w('Y') !== undefined) this.wco.y = abs ? (w('Y') as number) : this.mpos.y - (w('Y') as number);
      this.executed.push(line);
      return 'ok\r\n';
    }
    const X = w('X'), Y = w('Y'), F = w('F'), S = w('S');
    if (F !== undefined) this.modal.feed = F;
    if (S !== undefined) this.modal.s = S;
    if (X !== undefined || Y !== undefined) {
      doMove = true;
      if (rel) { target.x += X ?? 0; target.y += Y ?? 0; }
      else { if (X !== undefined) target.x = this.wco.x + X; if (Y !== undefined) target.y = this.wco.y + Y; }
    }
    if (doMove && motion === 'G1' && this.modal.feed <= 0) return 'error:22\r\n';
    if (jog && this.modal.feed <= 0) return 'error:22\r\n';
    this.modal.rel = jog ? this.modal.rel : rel; this.modal.motion = jog ? this.modal.motion : motion; this.modal.spindle = jog ? this.modal.spindle : spindle;
    this.executed.push(line);
    const laserMode = this.settings[32] === 1;
    if (doMove) {
      const rapid = !jog && motion === 'G0';
      const on = !jog && spindle !== 'M5' && (motion === 'G1' || !laserMode);
      const s = on ? Math.min(this.modal.s, this.settings[30]) : 0;
      this.queue.push({ tx: target.x, ty: target.y, feed: rapid ? this.rapid : this.modal.feed, rapid, s, jog, dwell: 0 });
      this.cursor = target;
    } else if (dwell > 0) {
      this.queue.push({ tx: this.cursor.x, ty: this.cursor.y, feed: 1, rapid: true, s: 0, jog: false, dwell });
    }
    return 'ok\r\n';
  }

  /** G10 / G92 : GRBL attend l'arrêt des mouvements ; ici on prend la position courante telle quelle. */
  private settleBeforeOffset() { this.cursor = { ...this.mpos }; }

  private system(line: string): string {
    if (line === '$$') return Object.entries(this.settings).map(([k, v]) => `$${k}=${v}`).join('\r\n') + '\r\nok\r\n';
    if (line === '$X') { if (this.alarm !== null) { this.alarm = null; this.cursor = { ...this.mpos }; return '[MSG:Caution: Unlocked]\r\nok\r\n'; } return 'ok\r\n'; }
    if (line === '$H') return 'error:5\r\n';
    if (line === '$I') return '[VER:1.1h.20190825:Mock]\r\n[OPT:V,15,128]\r\nok\r\n';
    if (line === '$G') return `[GC:G0 G54 G17 G21 ${this.modal.rel ? 'G91' : 'G90'} G94 ${this.modal.spindle} T0 F${this.modal.feed} S${this.modal.s}]\r\nok\r\n`;
    if (line === '$#') return `[G54:${(-this.wco.x).toFixed(3)},${(-this.wco.y).toFixed(3)},0.000]\r\nok\r\n`;
    if (line.startsWith('$J=')) {
      if (this.alarm !== null) return 'error:9\r\n';
      if (this.state !== 'Idle' && this.state !== 'Jog') return 'error:8\r\n';
      if (!this.queue.length) this.cursor = { ...this.mpos };
      const text = line.slice(3);
      const words = [...text.matchAll(/([A-Z])\s*(-?\d*\.?\d+)/g)].map((m) => ({ c: m[1], v: Number(m[2]) }));
      const rel = words.some((x) => x.c === 'G' && x.v === 91);
      const hasMove = words.some((x) => x.c === 'X' || x.c === 'Y');
      if (!hasMove) return 'error:2\r\n';
      const adj = words.filter((x) => !(x.c === 'G' && (x.v === 90 || x.v === 91 || x.v === 21 || x.v === 53)));
      const saved = { ...this.modal };
      this.modal.rel = rel;
      const r = this.gcode(adj, text, true);
      this.modal = saved;
      return r;
    }
    const set = /^\$(\d+)=(-?\d*\.?\d+)$/.exec(line);
    if (set) {
      if (this.state !== 'Idle') return 'error:8\r\n';
      const k = Number(set[1]);
      if (!(k in this.settings)) return 'error:3\r\n';
      this.settings[k] = Number(set[2]);
      if (k === 110) this.rapid = this.settings[110];
      return 'ok\r\n';
    }
    return 'error:3\r\n';
  }
}

/** Liaison simulée : relie `MockGrbl` à l'interface d'un port série, avec une horloge réelle accélérée par `speedup`. */
export class MockTransport implements GrblTransport {
  readonly kind = 'mock' as const;
  readonly label: string;
  readonly grbl: MockGrbl;
  onData: ((chunk: string) => void) | null = null;
  onClose: ((unexpected: boolean, reason?: string) => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private open_ = false;

  constructor(opt: MockOptions & { speedup?: number } = {}, private speedup = opt.speedup ?? 1) {
    this.grbl = new MockGrbl(opt);
    this.label = `Machine simulée${speedup !== 1 ? ` (×${speedup})` : ''}`;
    this.grbl.out = (t) => { if (this.open_) queueMicrotask(() => this.onData?.(t)); };
  }

  async open() {
    this.open_ = true;
    let last = Date.now();
    this.timer = setInterval(() => { const now = Date.now(); this.grbl.step(((now - last) / 1000) * this.speedup); last = now; }, 20);
    setTimeout(() => this.grbl.powerUp(), 30);
  }

  async write(data: string) {
    if (!this.open_) throw new Error('Port fermé');
    this.grbl.receive(data);
  }

  async close() { this.stop(); }

  /** Simule un câble USB arraché. */
  dropLink() { this.stop(); this.onClose?.(true, 'câble débranché (simulé)'); }

  private stop() { this.open_ = false; if (this.timer) { clearInterval(this.timer); this.timer = null; } }
}
