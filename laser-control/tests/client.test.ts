import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GcodeStreamer, GrblClient, RT, type GrblResponse, type GrblTransport, type LogEntry, type StreamHost, type StreamSnapshot } from '../src';

/** Liaison factice : enregistre ce qui est écrit, laisse le test « répondre » à la main. */
class FakeTransport implements GrblTransport {
  readonly kind = 'mock' as const;
  label = 'Fausse liaison';
  onData: ((chunk: string) => void) | null = null;
  onClose: ((unexpected: boolean, reason?: string) => void) | null = null;
  written: string[] = [];
  opened = false;
  closed = false;
  failWrite: unknown = undefined;
  failClose = false;
  async open() { this.opened = true; }
  async write(data: string) { if (this.failWrite !== undefined) throw this.failWrite; this.written.push(data); }
  async close() { this.closed = true; if (this.failClose) throw new Error('déjà fermé'); }
  feed(text: string) { this.onData!(text); }
  /** Lignes G-code (hors temps réel `?`) écrites. */
  get lines() { return this.written.filter((w) => w !== '?'); }
}

function make(opt?: ConstructorParameters<typeof GrblClient>[1]) {
  const t = new FakeTransport();
  const c = new GrblClient(t, opt);
  const logs: LogEntry[] = [];
  c.onLog.on((l) => logs.push(l));
  return { t, c, logs };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('GrblClient : connexion', () => {
  it('connect : ouvre, journalise, envoie « ? » tout de suite puis à intervalle régulier, sans journaliser les interrogations', async () => {
    const { t, c, logs } = make({ pollMs: 100 });
    expect(c.connected).toBe(false);
    await c.connect();
    expect(t.opened).toBe(true);
    expect(c.connected).toBe(true);
    expect(logs[0]).toEqual({ id: 1, dir: 'info', text: 'Connecté : Fausse liaison', poll: undefined });
    expect(t.written).toEqual(['?']);
    await vi.advanceTimersByTimeAsync(350);
    expect(t.written).toEqual(['?', '?', '?', '?']);
    expect(logs.filter((l) => l.dir === 'tx')).toEqual([]);
  });
  it('intervalle par défaut : 250 ms', async () => {
    const { t, c } = make();
    await c.connect();
    await vi.advanceTimersByTimeAsync(249);
    expect(t.written).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.written).toHaveLength(2);
  });
  it('disconnect : ferme, rend les lignes en attente en erreur, prévient (pas inattendu), arrête l\'interrogation', async () => {
    const { t, c, logs } = make({ pollMs: 100 });
    await c.connect();
    const closes: unknown[] = [];
    c.onClosed.on((e) => closes.push(e));
    const got: GrblResponse[] = [];
    c.queueLine('G1 X1', (r) => got.push(r));
    await c.disconnect();
    expect(t.closed).toBe(true);
    expect(c.connected).toBe(false);
    expect(got).toEqual([{ ok: false, code: null, message: 'Liaison fermée.' }]);
    expect(closes).toEqual([{ unexpected: false }]);
    expect(logs[logs.length - 1].text).toBe('Déconnecté.');
    const n = t.written.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.written).toHaveLength(n);
    await c.disconnect(); // deuxième appel : rien
    expect(closes).toHaveLength(1);
  });
  it('disconnect : une fermeture qui échoue est sans conséquence', async () => {
    const { t, c } = make();
    await c.connect();
    t.failClose = true;
    const closes: unknown[] = [];
    c.onClosed.on((e) => closes.push(e));
    await c.disconnect();
    expect(closes).toEqual([{ unexpected: false }]);
  });
  it('liaison perdue (câble) : lignes en erreur, onClosed inattendu avec la raison, journal', async () => {
    const { t, c, logs } = make();
    await c.connect();
    const closes: unknown[] = [];
    c.onClosed.on((e) => closes.push(e));
    const got: GrblResponse[] = [];
    c.queueLine('G0 X1', (r) => got.push(r));
    t.onClose!(true, 'câble arraché');
    expect(c.connected).toBe(false);
    expect(got).toEqual([{ ok: false, code: null, message: 'Liaison perdue.' }]);
    expect(closes).toEqual([{ unexpected: true, reason: 'câble arraché' }]);
    expect(logs[logs.length - 1].text).toBe('Liaison perdue (câble arraché).');
    t.onClose!(true, 'encore'); // déjà fermée : ignoré
    expect(closes).toHaveLength(1);
  });
  it('fermeture signalée par la liaison sans raison / non inattendue', async () => {
    const a = make();
    await a.c.connect();
    a.t.onClose!(true);
    expect(a.logs[a.logs.length - 1].text).toBe('Liaison perdue.');
    const b = make();
    await b.c.connect();
    b.t.onClose!(false);
    expect(b.logs[b.logs.length - 1].text).toBe('Déconnecté.');
  });
  it('une écriture qui échoue ferme la liaison comme perdue (message de l\'erreur, ou texte par défaut)', async () => {
    const a = make();
    await a.c.connect();
    const closes: unknown[] = [];
    a.c.onClosed.on((e) => closes.push(e));
    a.t.failWrite = new Error('USB retiré');
    a.c.queueLine('G1 X1', () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(closes).toEqual([{ unexpected: true, reason: 'USB retiré' }]);
    const b = make();
    await b.c.connect();
    const closesB: unknown[] = [];
    b.c.onClosed.on((e) => closesB.push(e));
    b.t.failWrite = 'chaîne';
    b.c.queueLine('G1 X1', () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(closesB).toEqual([{ unexpected: true, reason: 'écriture impossible' }]);
  });
});

describe('GrblClient : réception', () => {
  async function ready() {
    const m = make({ pollMs: 100000 });
    await m.c.connect();
    return m;
  }
  it('ok / error:N répondent aux lignes dans l\'ordre d\'envoi', async () => {
    const { t, c, logs } = await ready();
    const got: string[] = [];
    c.queueLine('G0 X1', (r) => got.push('a:' + JSON.stringify(r)));
    c.queueLine('G1 X2', (r) => got.push('b:' + JSON.stringify(r)));
    c.queueLine('G1 X3', (r) => got.push('c:' + JSON.stringify(r)));
    expect(c.pendingLines).toBe(3);
    expect(c.pendingCount).toBe('G0 X1'.length + 1 + 'G1 X2'.length + 1 + 'G1 X3'.length + 1);
    t.feed('ok\r\nerror:20\r\n');
    expect(got).toEqual(['a:{"ok":true}', 'b:{"ok":false,"code":20,"message":"Commande G-code non supportée."}']);
    expect(c.pendingLines).toBe(1);
    expect(c.pendingCount).toBe(6);
    t.feed('error:99\n');
    expect(got[2]).toBe('c:{"ok":false,"code":99,"message":"Erreur GRBL 99."}');
    expect(c.pendingCount).toBe(0);
    expect(logs.map((l) => l.text)).toContain('error:20 — Commande G-code non supportée.');
  });
  it('un ok ou une erreur sans ligne en attente est ignoré (le compteur reste à 0)', async () => {
    const { t, c } = await ready();
    t.feed('ok\nerror:3\n');
    expect(c.pendingCount).toBe(0);
    expect(c.pendingLines).toBe(0);
  });
  it('reconstitue les lignes coupées entre deux paquets, accepte \\r seul, ignore les lignes vides', async () => {
    const { t, c } = await ready();
    const got: GrblResponse[] = [];
    c.queueLine('A', (r) => got.push(r));
    c.queueLine('B', (r) => got.push(r));
    t.feed('o');
    expect(got).toEqual([]);
    t.feed('k\r\r\n\n  \nok');
    expect(got).toHaveLength(1); // « ok » final pas encore terminé
    t.feed('\r');
    expect(got).toHaveLength(2);
  });
  it('alarme : événement avec le code, journal avec le message', async () => {
    const { t, c, logs } = await ready();
    const alarms: number[] = [];
    c.onAlarm.on((a) => alarms.push(a));
    t.feed('ALARM:3\r\n');
    expect(alarms).toEqual([3]);
    expect(logs[logs.length - 1].text).toContain('ALARM:3 — Réinitialisation en plein mouvement');
    t.feed('ALARM:77\r\n');
    expect(logs[logs.length - 1].text).toBe('ALARM:77 — Alarme GRBL 77.');
  });
  it('rapport d\'état : stocké, émis, WCO retenu d\'un rapport à l\'autre, journalisé comme interrogation', async () => {
    const { t, c, logs } = await ready();
    const seen: number[] = [];
    c.onStatus.on((s) => seen.push(s.wpos.x));
    t.feed('<Idle|MPos:10,0,0|WCO:4,0,0>\r\n');
    t.feed('<Run|MPos:20,0,0|FS:100,200>\r\n');
    expect(seen).toEqual([6, 16]); // deuxième rapport sans WCO : utilise le précédent
    expect(c.status!.state).toBe('Run');
    expect(c.status!.spindle).toBe(200);
    expect(logs.filter((l) => l.dir === 'rx' && l.text.startsWith('<')).every((l) => l.poll === true)).toBe(true);
    t.feed('<Bidule|MPos:0,0,0>\r\n'); // illisible : journalisé, pas émis
    expect(seen).toHaveLength(2);
    expect(c.status!.state).toBe('Run');
  });
  it('le premier rapport déclenche une lecture « $$ » (une seule fois) ; les réglages sont lus et émis', async () => {
    const { t, c } = await ready();
    const sets: Record<number, number>[] = [];
    c.onSettings.on((s) => sets.push(s));
    t.feed('<Idle|MPos:0,0,0>\r\n');
    expect(t.lines).toEqual(['$$\n']);
    t.feed('<Idle|MPos:0,0,0>\r\n');
    expect(t.lines).toEqual(['$$\n']);
    t.feed('$30=1000\r\n$32=1\r\nok\r\n');
    expect(c.settings).toEqual({ 30: 1000, 32: 1 });
    expect(sets).toHaveLength(2);
    expect(sets[0]).toEqual({ 30: 1000 });
    expect(c.pendingLines).toBe(0);
  });
  it('message de bienvenue : lignes en attente abandonnées, nouvelle lecture des réglages permise, événement', async () => {
    const { t, c } = await ready();
    let welcomes = 0;
    c.onWelcome.on(() => welcomes++);
    t.feed('<Idle|MPos:0,0,0>\r\n'); // $$ demandé, en attente
    const got: GrblResponse[] = [];
    c.queueLine('G1 X1', (r) => got.push(r));
    t.feed("Grbl 1.1h ['$' for help]\r\n");
    expect(welcomes).toBe(1);
    expect(got).toEqual([{ ok: false, code: null, message: "Le contrôleur s'est réinitialisé." }]);
    expect(c.pendingLines).toBe(0);
    expect(c.pendingCount).toBe(0);
    t.written.length = 0;
    t.feed('<Idle|MPos:0,0,0>\r\n');
    expect(t.lines).toEqual(['$$\n']); // relue après la réinitialisation
  });
  it('[MSG:…] devient une notice ; le reste est journalisé', async () => {
    const { t, c, logs } = await ready();
    const notes: string[] = [];
    c.onNotice.on((n) => notes.push(n));
    t.feed('[MSG:Caution: Unlocked]\r\n[VER:1.1h]\r\n');
    expect(notes).toEqual(['Caution: Unlocked']);
    expect(logs.map((l) => l.text)).toContain('[VER:1.1h]');
  });
});

describe('GrblClient : envoi', () => {
  it('queueLine hors connexion : réponse immédiate « non connectée », rien d\'écrit', () => {
    const { t, c } = make();
    const got: GrblResponse[] = [];
    expect(c.queueLine('G0 X1', (r) => got.push(r))).toBe(true);
    expect(got).toEqual([{ ok: false, code: null, message: 'Machine non connectée.' }]);
    expect(t.written).toEqual([]);
  });
  it('comptage de caractères : refuse quand octets en attente + ligne + 1 > 127, accepte une seule grosse ligne si rien n\'attend, libère avec ok', async () => {
    const { t, c } = make({ pollMs: 100000 });
    await c.connect();
    const line = 'G1 X' + '1'.repeat(46); // 50 caractères → 51 octets
    expect(c.queueLine(line, () => {})).toBe(true);
    expect(c.queueLine(line, () => {})).toBe(true); // 102
    expect(c.pendingCount).toBe(102);
    expect(c.queueLine(line, () => {})).toBe(false); // 153 > 127
    expect(c.pendingLines).toBe(2);
    expect(c.queueLine('G1', () => {})).toBe(true); // 102 + 3 = 105 ≤ 127
    expect(c.queueLine('x'.repeat(21), () => {})).toBe(true); // 105 + 22 = 127 : pile
    expect(c.queueLine('x', () => {})).toBe(false);
    t.feed('ok\nok\nok\nok\nok\n');
    expect(c.pendingCount).toBe(0);
    expect(c.queueLine('y'.repeat(200), () => {})).toBe(true); // seule : passe même si trop longue
    expect(c.queueLine('z', () => {})).toBe(false);
  });
  it('taille de tampon personnalisée', async () => {
    const { c } = make({ bufferSize: 10, pollMs: 100000 });
    await c.connect();
    expect(c.queueLine('12345', () => {})).toBe(true); // 6
    expect(c.queueLine('1234', () => {})).toBe(false); // 6 + 5 = 11 > 10
    expect(c.queueLine('123', () => {})).toBe(true); // 10
  });
  it('journal « tx » sans le saut de ligne', async () => {
    const { c, logs } = make({ pollMs: 100000 });
    await c.connect();
    c.queueLine('G1 X1', () => {});
    await vi.advanceTimersByTimeAsync(0); // le journal s'écrit après l'écriture (asynchrone)
    expect(logs.filter((l) => l.dir === 'tx').map((l) => l.text)).toEqual(['G1 X1']);
  });
  it('send : résout avec la réponse', async () => {
    const { t, c } = make({ pollMs: 100000 });
    await c.connect();
    const p = c.send('G10 L20 P1 X0');
    t.feed('ok\r\n');
    expect(await p).toEqual({ ok: true });
    const q = c.send('BAD');
    t.feed('error:1\r\n');
    expect(await q).toMatchObject({ ok: false, code: 1 });
  });
  it('send : délai dépassé (6 s par défaut, réglable), puis une réponse tardive est sans effet', async () => {
    const { t, c } = make({ pollMs: 100000 });
    await c.connect();
    const p = c.send('G4 P9');
    let res: GrblResponse | null = null;
    void p.then((r) => { res = r; });
    await vi.advanceTimersByTimeAsync(5999);
    expect(res).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(res).toEqual({ ok: false, code: null, message: 'Pas de réponse de la machine.' });
    t.feed('ok\r\n'); // arrive trop tard : ne doit pas planter ni changer le résultat
    expect(res).toEqual({ ok: false, code: null, message: 'Pas de réponse de la machine.' });
    const q = c.send('X', 100);
    await vi.advanceTimersByTimeAsync(100);
    expect(await q).toMatchObject({ message: 'Pas de réponse de la machine.' });
  });
  it('send : tampon plein = échec immédiat sans écrire', async () => {
    const { t, c } = make({ pollMs: 100000 });
    await c.connect();
    c.queueLine('x'.repeat(120), () => {});
    const before = t.written.length;
    expect(await c.send('G1 X1 Y1')).toEqual({ ok: false, code: null, message: 'Tampon de la machine plein : réessaie.' });
    expect(t.written).toHaveLength(before);
  });
  it('send hors connexion : « non connectée »', async () => {
    const { c } = make();
    expect(await c.send('G0')).toEqual({ ok: false, code: null, message: 'Machine non connectée.' });
  });
  it('readSettings envoie « $$ »', async () => {
    const { t, c } = make({ pollMs: 100000 });
    await c.connect();
    const p = c.readSettings();
    expect(t.lines).toEqual(['$$\n']);
    t.feed('$30=1000\nok\n');
    expect(await p).toEqual({ ok: true });
    expect(c.settings[30]).toBe(1000);
  });
});

describe('GrblClient : temps réel et arrêt d\'urgence', () => {
  it('realtime : nom lisible dans le journal, 1 octet sans saut de ligne', async () => {
    const { t, c, logs } = make({ pollMs: 100000 });
    await c.connect();
    t.written.length = 0;
    await c.realtime(RT.hold);
    await c.realtime(RT.resume);
    await c.realtime(RT.jogCancel);
    await c.realtime('?');
    expect(t.written).toEqual(['!', '~', '\x85', '?']);
    expect(logs.filter((l) => l.dir === 'tx').map((l) => l.text)).toEqual(['! (pause)', '~ (reprise)', '0x85 (annulation du déplacement)', '?']);
  });
  it('realtime reset : abandonne les lignes en attente', async () => {
    const { t, c, logs } = make({ pollMs: 100000 });
    await c.connect();
    const got: GrblResponse[] = [];
    c.queueLine('G1 X1', (r) => got.push(r));
    await c.realtime(RT.reset);
    expect(got).toEqual([{ ok: false, code: null, message: 'Réinitialisation.' }]);
    expect(c.pendingCount).toBe(0);
    expect(t.written[t.written.length - 1]).toBe('\x18');
    expect(logs[logs.length - 1].text).toBe('0x18 (réinitialisation douce)');
  });
  it('realtime hors connexion : rien d\'écrit', async () => {
    const { t, c } = make();
    await c.realtime(RT.hold);
    expect(t.written).toEqual([]);
  });
  it('emergencyStop : « ! », 120 ms, 0x18, 500 ms, puis M5 (avec réponse)', async () => {
    const { t, c } = make({ pollMs: 100000 });
    await c.connect();
    t.written.length = 0;
    const p = c.emergencyStop();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.written).toEqual(['!']);
    await vi.advanceTimersByTimeAsync(119);
    expect(t.written).toEqual(['!']);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.written).toEqual(['!', '\x18']);
    await vi.advanceTimersByTimeAsync(499);
    expect(t.lines).toEqual(['!', '\x18']);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.written).toEqual(['!', '\x18', 'M5\n']);
    t.feed('error:9\r\n'); // M5 refusé en alarme : sans importance
    await p;
  });
  it('emergencyStop : pas de M5 si la liaison est tombée pendant l\'arrêt', async () => {
    const { t, c } = make({ pollMs: 100000 });
    await c.connect();
    t.written.length = 0;
    const p = c.emergencyStop();
    await vi.advanceTimersByTimeAsync(100);
    t.onClose!(true, 'perdue');
    await vi.advanceTimersByTimeAsync(1000);
    await p;
    expect(t.written).toEqual(['!']);
  });
});

describe('GcodeStreamer', () => {
  /** Hôte factice : accepte jusqu'à `room` lignes en attente, réponses déclenchées à la main. */
  function host(room = Infinity) {
    const waiting: { line: string; cb: (r: GrblResponse) => void }[] = [];
    const sent: string[] = [];
    const h: StreamHost & { room: number } = {
      room,
      queueLine(line, cb) { if (waiting.length >= h.room) return false; waiting.push({ line, cb }); sent.push(line); return true; },
    };
    const ack = (r: GrblResponse = { ok: true }) => waiting.shift()!.cb(r);
    return { h, sent, waiting, ack };
  }
  const OK: GrblResponse = { ok: true };

  it('nettoie les lignes : commentaires et lignes vides retirés', () => {
    const { h } = host();
    expect(new GcodeStreamer(h, ['G21 ; mm', '', '(rien)', '  G1  X1 ']).lines).toEqual(['G21', 'G1 X1']);
  });
  it('programme vide : terminé tout de suite, rien d\'envoyé', () => {
    const { h, sent } = host();
    const s = new GcodeStreamer(h, ['; seulement un commentaire']);
    const snaps: StreamSnapshot[] = [];
    s.onChange = (x) => snaps.push(x);
    s.start();
    expect(s.snapshot()).toEqual({ phase: 'done', total: 0, sent: 0, acked: 0, error: null });
    expect(sent).toEqual([]);
    expect(snaps).toHaveLength(1);
  });
  it('envoie tout ce que le tampon accepte, puis une ligne de plus à chaque ok ; draining puis done à l\'inactivité', () => {
    const { h, sent, ack } = host(2);
    const s = new GcodeStreamer(h, ['A', 'B', 'C', 'D']);
    expect(s.snapshot().phase).toBe('idle');
    s.start();
    expect(sent).toEqual(['A', 'B']);
    expect(s.snapshot()).toMatchObject({ phase: 'running', sent: 2, acked: 0, total: 4 });
    s.start(); // déjà démarré : sans effet
    expect(sent).toEqual(['A', 'B']);
    ack();
    expect(sent).toEqual(['A', 'B', 'C']);
    ack(); ack();
    expect(sent).toEqual(['A', 'B', 'C', 'D']);
    expect(s.snapshot()).toMatchObject({ phase: 'running', acked: 3 });
    s.machineIdle(); // pas encore tout acquitté : sans effet
    expect(s.snapshot().phase).toBe('running');
    ack();
    expect(s.snapshot()).toMatchObject({ phase: 'draining', acked: 4, sent: 4 });
    s.machineIdle();
    expect(s.snapshot().phase).toBe('done');
    s.machineIdle();
    expect(s.snapshot().phase).toBe('done');
  });
  it('onChange reçoit chaque transition', () => {
    const { h, ack } = host();
    const s = new GcodeStreamer(h, ['A']);
    const phases: string[] = [];
    s.onChange = (x) => phases.push(x.phase);
    s.start();
    ack();
    s.machineIdle();
    expect(phases).toEqual(['running', 'running', 'draining', 'done']);
  });
  it('pause : plus rien n\'est envoyé, les ok en route sont comptés ; reprise relance l\'envoi', () => {
    const { h, sent, ack } = host(2);
    const s = new GcodeStreamer(h, ['A', 'B', 'C']);
    s.start();
    s.pause();
    expect(s.snapshot().phase).toBe('paused');
    ack();
    expect(sent).toEqual(['A', 'B']);
    expect(s.snapshot()).toMatchObject({ phase: 'paused', acked: 1 });
    s.pause(); // déjà en pause : sans effet
    s.resume();
    expect(s.snapshot().phase).toBe('running');
    expect(sent).toEqual(['A', 'B', 'C']);
  });
  it('pause et reprise hors de leur phase : sans effet', () => {
    const { h } = host();
    const s = new GcodeStreamer(h, ['A']);
    s.pause();
    s.resume();
    expect(s.snapshot().phase).toBe('idle');
  });
  it('pause pendant que le dernier ok arrive : reste en pause ; la reprise passe directement en draining', () => {
    const { h, ack } = host();
    const s = new GcodeStreamer(h, ['A', 'B']);
    s.start();
    s.pause();
    ack(); ack();
    expect(s.snapshot()).toMatchObject({ phase: 'paused', acked: 2 });
    s.resume();
    expect(s.snapshot().phase).toBe('draining');
    s.machineIdle();
    expect(s.snapshot().phase).toBe('done');
  });
  it('ligne refusée : erreur avec numéro de ligne, texte et message GRBL ; plus rien d\'envoyé', () => {
    const { h, sent, ack } = host(2);
    const s = new GcodeStreamer(h, ['A', 'B', 'C']);
    s.start();
    ack({ ok: false, code: 20, message: 'Commande G-code non supportée.' });
    expect(s.snapshot().phase).toBe('error');
    expect(s.snapshot().error).toEqual({ line: 1, text: 'A', message: 'error:20 — Commande G-code non supportée.' });
    expect(sent).toEqual(['A', 'B']);
    ack(); // le ok de B arrive après l'erreur : ignoré
    expect(s.snapshot().acked).toBe(1);
    expect(s.snapshot().phase).toBe('error');
  });
  it('erreur sans code (liaison perdue) : message seul', () => {
    const { h, ack } = host();
    const s = new GcodeStreamer(h, ['A', 'B']);
    s.start();
    ack(OK);
    ack({ ok: false, code: null, message: 'Liaison perdue.' });
    expect(s.snapshot().error).toEqual({ line: 2, text: 'B', message: 'Liaison perdue.' });
  });
  it('abort : sans erreur = aborted ; avec erreur = error et ligne = acquittées + 1 ; sans effet une fois fini', () => {
    const a = host();
    const s1 = new GcodeStreamer(a.h, ['A', 'B']);
    s1.start();
    a.ack();
    s1.abort();
    expect(s1.snapshot()).toMatchObject({ phase: 'aborted', error: null, acked: 1 });
    a.ack(); // réponse tardive ignorée
    expect(s1.snapshot().acked).toBe(1);
    s1.abort({ text: 'x', message: 'y' });
    expect(s1.snapshot().phase).toBe('aborted');

    const b = host();
    const s2 = new GcodeStreamer(b.h, ['A', 'B', 'C']);
    s2.start();
    b.ack();
    s2.abort({ text: 'ALARM', message: 'Alarme 1' });
    expect(s2.snapshot()).toMatchObject({ phase: 'error', error: { line: 2, text: 'ALARM', message: 'Alarme 1' } });
    s2.abort();
    expect(s2.snapshot().phase).toBe('error');

    const c = host();
    const s3 = new GcodeStreamer(c.h, ['A']);
    s3.start();
    c.ack();
    s3.machineIdle();
    s3.abort();
    expect(s3.snapshot().phase).toBe('done');
  });
  it('un ok qui arrive pendant « draining » ou après « done » ne change rien', () => {
    const { h, ack } = host();
    const s = new GcodeStreamer(h, ['A']);
    s.start();
    ack();
    expect(s.snapshot().phase).toBe('draining');
    s.machineIdle();
    expect(s.snapshot().acked).toBe(1);
  });
  it('avec un vrai client : la file est bien alimentée par les ok', async () => {
    const t = new FakeTransport();
    const c = new GrblClient(t, { pollMs: 100000 });
    await c.connect();
    t.written.length = 0;
    const s = new GcodeStreamer(c, Array.from({ length: 30 }, (_, i) => `G1 X${i + 1} Y${i + 1} F1000`));
    s.start();
    const first = t.written.length;
    expect(first).toBeLessThan(30);
    expect(c.pendingCount).toBeLessThanOrEqual(127);
    for (let i = 0; i < 30; i++) t.feed('ok\r\n');
    expect(t.written).toHaveLength(30);
    expect(s.snapshot()).toMatchObject({ phase: 'draining', acked: 30 });
  });
});
