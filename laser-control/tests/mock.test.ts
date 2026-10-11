import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MockGrbl, MockTransport } from '../src';

/** Contrôleur simulé piloté à la main : `tx(ligne)` envoie une ligne et rend ce que le contrôleur a répondu. */
function rig(opt?: ConstructorParameters<typeof MockGrbl>[0]) {
  const g = new MockGrbl(opt);
  let buf = '';
  g.out = (t) => { buf += t; };
  const take = () => { const b = buf; buf = ''; return b; };
  const tx = (line: string) => { g.receive(line + '\n'); return take(); };
  return { g, tx, take };
}

describe('MockGrbl : réponses', () => {
  it('message de bienvenue', () => {
    const { g, take } = rig();
    g.powerUp();
    expect(take()).toBe("\r\nGrbl 1.1h ['$' for help]\r\n");
  });
  it('sans écouteur sur la sortie, le contrôleur répond dans le vide sans erreur', () => {
    const g = new MockGrbl();
    g.powerUp();
    g.receive('G0 X1\n?');
    expect(g.executed).toEqual(['G0 X1']);
  });
  it('lignes vides ou de commentaire : ok ; lignes de blancs seuls : rien', () => {
    const { g, tx, take } = rig();
    expect(tx('; rien')).toBe('ok\r\n');
    expect(tx('(rien)')).toBe('ok\r\n');
    g.receive('   \n');
    expect(take()).toBe('');
    g.receive('\n\r\n');
    expect(take()).toBe('');
  });
  it('erreurs de syntaxe : ligne trop longue, lettre inconnue, texte sans mot, reste illisible', () => {
    const { tx } = rig();
    expect(tx('G1 ' + 'X1 '.repeat(30))).toBe('error:11\r\n');
    expect(tx('Q5')).toBe('error:1\r\n');
    expect(tx('HELLO')).toBe('error:1\r\n');
    expect(tx('G1 X1 #')).toBe('error:1\r\n');
  });
  it('commandes non supportées : G et M inconnus = error:20, M8 / M9 / M2 / M30 acceptés', () => {
    const { tx } = rig();
    expect(tx('G17')).toBe('error:20\r\n');
    expect(tx('M7')).toBe('error:20\r\n');
    for (const l of ['G21', 'G54', 'G94', 'G53 G0 X1', 'M8', 'M9', 'M2', 'M30', 'M3 S0', 'M4 S0', 'M5', 'G90', 'G91']) expect(tx(l)).toBe('ok\r\n');
  });
  it('avance obligatoire : G1 sans F = error:22', () => {
    const { tx, g } = rig();
    expect(tx('G1 X10')).toBe('error:22\r\n');
    expect(g.executed).toEqual([]);
    expect(tx('G1 X10 F600')).toBe('ok\r\n');
    expect(tx('G1 X20')).toBe('ok\r\n'); // F est modal
    expect(g.executed).toEqual(['G1 X10 F600', 'G1 X20']);
    expect(tx('G0 X5')).toBe('ok\r\n'); // G0 n'exige pas F
  });
  it('commandes $ : $$, $I, $G, $#, $H, inconnue', () => {
    const { tx } = rig();
    const all = tx('$$');
    expect(all.endsWith('\r\nok\r\n')).toBe(true);
    expect(all).toContain('$30=1000');
    expect(all).toContain('$32=1');
    expect(all).toContain('$130=410');
    expect(all).toContain('$131=400');
    expect(tx('$I')).toBe('[VER:1.1h.20190825:Mock]\r\n[OPT:V,15,128]\r\nok\r\n');
    expect(tx('$G')).toBe('[GC:G0 G54 G17 G21 G90 G94 M5 T0 F0 S0]\r\nok\r\n');
    tx('G91'); tx('M4 S300'); tx('G1 X0 F250');
    expect(tx('$G')).toBe('[GC:G0 G54 G17 G21 G91 G94 M4 T0 F250 S300]\r\nok\r\n');
    expect(tx('$#')).toBe('[G54:0.000,0.000,0.000]\r\nok\r\n');
    expect(tx('$H')).toBe('error:5\r\n');
    expect(tx('$Z')).toBe('error:3\r\n');
  });
  it('réglages : $N=v, clé inconnue, refusé hors Idle, $110 change la vitesse rapide ; mode laser par option', () => {
    const { g, tx } = rig();
    expect(tx('$30=500')).toBe('ok\r\n');
    expect(g.settings[30]).toBe(500);
    expect(tx('$999=1')).toBe('error:3\r\n');
    expect(tx('$110=1200')).toBe('ok\r\n');
    tx('G0 X12');
    g.step(1); // 12 mm à 1200 mm/min = 0,6 s
    expect(g.mpos.x).toBe(12);
    tx('G1 X100 F60');
    expect(tx('$30=1000')).toBe('error:8\r\n');
    expect(rig({ laserMode: false }).g.settings[32]).toBe(0);
    expect(rig().g.settings[32]).toBe(1);
    const fast = rig({ rapid: 9000 }).g;
    expect(fast.settings[110]).toBe(9000);
    expect(fast.settings[111]).toBe(9000);
  });
  it('G10 L20 : exige L20 et P ; fixe l\'origine de travail ; G92 aussi', () => {
    const { g, tx } = rig();
    expect(tx('G10 X0')).toBe('error:2\r\n');
    expect(tx('G10 L2 P1 X0')).toBe('error:2\r\n');
    expect(tx('G10 L20 X0')).toBe('error:2\r\n');
    tx('G0 X10 Y20');
    g.step(10);
    expect(tx('G10 L20 P1 X0 Y0')).toBe('ok\r\n');
    expect(g.wco).toEqual({ x: 10, y: 20 });
    expect(tx('G92 X3')).toBe('ok\r\n'); // seul X : Y ne bouge pas
    expect(g.wco).toEqual({ x: 7, y: 20 });
    expect(tx('G92 Y1')).toBe('ok\r\n');
    expect(g.wco).toEqual({ x: 7, y: 19 });
    expect(tx('$#')).toBe('[G54:-7.000,-19.000,0.000]\r\nok\r\n');
  });
});

describe('MockGrbl : mouvements et états', () => {
  it('G1 absolu : Run pendant le trajet, Idle à l\'arrivée, durée = distance / vitesse', () => {
    const { g, tx } = rig();
    expect(g.state).toBe('Idle');
    tx('G1 X60 F600'); // 60 mm à 10 mm/s
    expect(g.state).toBe('Run');
    g.step(3);
    expect(g.mpos.x).toBeCloseTo(30, 9);
    expect(g.state).toBe('Run');
    g.step(3);
    expect(g.mpos.x).toBe(60);
    expect(g.state).toBe('Idle');
    g.step(1); // rien à faire : ne bouge pas
    expect(g.mpos.x).toBe(60);
  });
  it('un pas qui traverse plusieurs blocs les enchaîne', () => {
    const { g, tx } = rig();
    tx('G1 X10 F600'); tx('G1 X10 Y10'); tx('G1 X0 Y10');
    g.step(3.5);
    expect(g.mpos.x).toBeCloseTo(0, 9);
    expect(g.mpos.y).toBeCloseTo(10, 9);
    g.step(1);
    expect(g.state).toBe('Idle');
  });
  it('relatif G91 et retour en absolu ; axe omis conservé ; décalage d\'origine appliqué à l\'absolu seulement', () => {
    const { g, tx } = rig();
    tx('G91'); tx('G0 X10'); tx('G0 Y5'); tx('G0 X-3 Y1');
    g.step(10);
    expect(g.mpos).toEqual({ x: 7, y: 6 });
    tx('G90'); tx('G10 L20 P1 X0 Y0');
    expect(g.wco).toEqual({ x: 7, y: 6 });
    tx('G0 X10'); // Y omis : reste à la position courante de l'outil (6 machine)
    g.step(10);
    expect(g.mpos).toEqual({ x: 17, y: 6 });
  });
  it('pause G4 : bloc d\'attente, sans déplacement ; P absent ou nul : rien en file', () => {
    const { g, tx } = rig();
    expect(tx('G4 P2')).toBe('ok\r\n');
    expect(g.state).toBe('Run');
    g.step(1);
    expect(g.state).toBe('Run');
    g.step(1);
    expect(g.state).toBe('Idle');
    expect(tx('G4')).toBe('ok\r\n');
    expect(g.state).toBe('Idle');
    expect(tx('G4 P0')).toBe('ok\r\n');
    expect(g.state).toBe('Idle');
  });
  it('laser : en mode laser G0 ne brûle pas, G1 oui, plafonné à $30 ; M5 l\'éteint ; M3 hors mode laser brûle aussi en G0', () => {
    const { g, tx } = rig();
    tx('M4 S2000');
    tx('G0 X10');
    expect(g.spindleOut).toBe(0);
    g.step(10);
    tx('G1 X100 F60');
    expect(g.spindleOut).toBe(1000); // S 2000 plafonné à $30
    expect(g.maxSSeen).toBe(2000);
    g.step(1);
    expect(g.maxSOut).toBe(1000);
    const eteint = rig();
    eteint.tx('M4 S500'); eteint.tx('M5'); eteint.tx('G1 X10 F60');
    expect(eteint.g.spindleOut).toBe(0);
    const off = rig({ laserMode: false });
    off.tx('M3 S400');
    off.tx('G0 X10');
    expect(off.g.spindleOut).toBe(400);
  });
  it('S sans M3 / M4 ne brûle pas', () => {
    const { g, tx } = rig();
    tx('G1 X10 F60 S800');
    expect(g.spindleOut).toBe(0);
  });
  it('état Jog pendant un $J=, relatif, G53 / G90 / G91 / G21 ignorés dans la ligne, la modalité n\'est pas modifiée', () => {
    const { g, tx } = rig();
    expect(tx('$J=G91 G21 X5 Y3 F3000')).toBe('ok\r\n');
    expect(g.state).toBe('Jog');
    expect(g.spindleOut).toBe(0);
    g.step(1);
    expect(g.mpos).toEqual({ x: 5, y: 3 });
    expect(g.executed[g.executed.length - 1]).toBe('G91 G21 X5 Y3 F3000');
    tx('G0 X20'); // la modalité reste absolue : $J= en G91 ne l'a pas changée
    g.step(1);
    expect(g.mpos.x).toBe(20);
    expect(tx('$J=G90 G21 X1 Y1 F3000')).toBe('ok\r\n');
    g.step(1);
    expect(g.mpos).toEqual({ x: 1, y: 1 });
    expect(tx('$J=G53 X0 F100')).toBe('ok\r\n');
  });
  it('$J= refusé : sans F, sans axe, pendant une coupe, en alarme', () => {
    const { g, tx, take } = rig();
    expect(tx('$J=G91 X5')).toBe('error:22\r\n');
    expect(tx('$J=G91 F100')).toBe('error:2\r\n');
    tx('G1 X100 F60');
    expect(tx('$J=G91 X5 F100')).toBe('error:8\r\n');
    g.triggerAlarm(1);
    take();
    expect(tx('$J=G91 X5 F100')).toBe('error:9\r\n');
  });
  it('un déplacement de longueur nulle est un bloc vide, retiré au pas suivant', () => {
    const { g, tx } = rig();
    expect(tx('G1 X0 Y0 F600')).toBe('ok\r\n');
    expect(g.state).toBe('Run');
    g.step(0.01);
    expect(g.state).toBe('Idle');
  });
  it('un $J= peut suivre un autre $J= (état Jog) et part de la fin du précédent', () => {
    const { g, tx } = rig();
    tx('$J=G91 X5 F600');
    expect(tx('$J=G91 X5 F600')).toBe('ok\r\n');
    g.step(5);
    expect(g.mpos.x).toBe(10);
  });
});

describe('MockGrbl : temps réel, alarmes, reset', () => {
  it('rapport « ? » : état, positions, avance, puissance ; WCO au premier rapport puis tous les dix', () => {
    const { g, tx, take } = rig();
    g.receive('?');
    expect(take()).toBe('<Idle|MPos:0.000,0.000,0.000|FS:0,0|WCO:0.000,0.000,0.000>\r\n');
    g.receive('?');
    expect(take()).toBe('<Idle|MPos:0.000,0.000,0.000|FS:0,0>\r\n');
    for (let i = 0; i < 8; i++) g.receive('?');
    take();
    g.receive('?');
    expect(take()).toContain('|WCO:'); // le dixième
    tx('M4 S500'); tx('G1 X100 F600');
    g.receive('?');
    expect(take()).toBe('<Run|MPos:0.000,0.000,0.000|FS:600,500>\r\n');
    g.step(1);
    g.receive('?');
    expect(take()).toBe('<Run|MPos:10.000,0.000,0.000|FS:600,500>\r\n');
  });
  it('un G10 relance l\'envoi du WCO au rapport suivant', () => {
    const { g, tx, take } = rig();
    g.receive('?'); g.receive('?'); take();
    tx('G10 L20 P1 X0');
    g.receive('?');
    expect(take()).toContain('|WCO:');
  });
  it('rapport pendant un rapide : avance = vitesse rapide', () => {
    const { g, tx, take } = rig();
    tx('G0 X100');
    g.receive('?');
    expect(take()).toContain('FS:6000,0');
    const slow = rig({ rapid: 3000 });
    slow.tx('G0 X100');
    slow.g.receive('?');
    expect(slow.take()).toContain('FS:3000,0');
  });
  it('pause « ! » : freinage 0,15 s (Hold:1) puis arrêt (Hold:0), laser éteint, plus de mouvement ; reprise « ~ »', () => {
    const { g, tx, take } = rig();
    tx('M4 S500'); tx('G1 X100 F600');
    g.step(1);
    g.receive('!');
    expect(g.state).toBe('Hold');
    expect(g.spindleOut).toBe(0);
    g.receive('?'); expect(take()).toContain('<Hold:1|MPos:10.000');
    g.step(0.1);
    g.receive('?'); expect(take()).toContain('<Hold:1|');
    expect(g.mpos.x).toBe(10); // le freinage n'avance pas dans la simulation
    g.step(0.1);
    g.receive('?'); expect(take()).toContain('<Hold:0|');
    g.step(5);
    expect(g.mpos.x).toBe(10);
    g.receive('~');
    expect(g.state).toBe('Run');
    g.step(1);
    expect(g.mpos.x).toBe(20);
  });
  it('« ! » sans mouvement en cours, ou en alarme : sans effet ; « ~ » sans pause : sans effet', () => {
    const { g, tx } = rig();
    g.receive('!');
    expect(g.state).toBe('Idle');
    g.receive('~');
    expect(g.state).toBe('Idle');
    tx('G1 X10 F60');
    g.triggerAlarm(2);
    g.receive('!');
    expect(g.state).toBe('Alarm');
  });
  it('annulation de jog 0x85 : vide le jog et reste où l\'on est ; sans effet sur une coupe', () => {
    const { g, tx } = rig();
    tx('$J=G91 X100 F600');
    g.step(1);
    g.receive('\x85');
    expect(g.state).toBe('Idle');
    expect(g.mpos.x).toBe(10);
    tx('$J=G91 X5 F600');
    g.step(10);
    expect(g.mpos.x).toBe(15); // le curseur est reparti de la position réelle
    tx('G1 X200 F60');
    g.receive('\x85');
    expect(g.state).toBe('Run');
  });
  it('alarme déclenchée : file vidée, laser éteint, error:9 pour le G-code, $X déverrouille', () => {
    const { g, tx, take } = rig();
    tx('M4 S500'); tx('G1 X100 F600');
    g.triggerAlarm(1);
    expect(take()).toBe('ALARM:1\r\n');
    expect(g.state).toBe('Alarm');
    expect(g.spindleOut).toBe(0);
    g.step(10);
    expect(g.mpos.x).toBe(0);
    expect(tx('G0 X1')).toBe('error:9\r\n');
    expect(tx('$X')).toBe('[MSG:Caution: Unlocked]\r\nok\r\n');
    expect(g.state).toBe('Idle');
    expect(tx('G0 X1')).toBe('ok\r\n');
    expect(tx('$X')).toBe('ok\r\n'); // déjà déverrouillée
  });
  it('réinitialisation douce 0x18 : en mouvement = ALARM:3 ; en alarme = rappel de déverrouillage ; au repos = bienvenue seule ; état modal remis à zéro', () => {
    const a = rig();
    a.tx('M4 S500'); a.tx('G1 X100 F600');
    a.g.step(1);
    a.g.receive('\x18');
    expect(a.take()).toBe("\r\nGrbl 1.1h ['$' for help]\r\nALARM:3\r\n[MSG:Reset while in motion]\r\n");
    expect(a.g.state).toBe('Alarm');
    a.g.receive('\x18');
    expect(a.take()).toBe("\r\nGrbl 1.1h ['$' for help]\r\n[MSG:'$H'|'$X' to unlock]\r\n");
    a.tx('$X');
    a.tx('G91');
    a.g.receive('\x18');
    expect(a.take()).toBe("\r\nGrbl 1.1h ['$' for help]\r\n");
    expect(a.tx('$G')).toBe('[GC:G0 G54 G17 G21 G90 G94 M5 T0 F0 S0]\r\nok\r\n');
    expect(a.g.mpos.x).toBe(10); // la tête reste où elle s'est arrêtée
    // pendant une pause aussi : mouvement interrompu
    const b = rig();
    b.tx('G1 X100 F600'); b.g.receive('!'); b.take();
    b.g.receive('\x18');
    expect(b.take()).toContain('ALARM:3');
    // un reset vide aussi les lignes reçues et le tampon
    const c = rig();
    c.g.receive('G0 X1');
    c.g.receive('\x18');
    expect(c.take()).toBe("\r\nGrbl 1.1h ['$' for help]\r\n");
    c.g.receive('\n');
    expect(c.take()).toBe('');
  });
});

describe('MockGrbl : planificateur et tampon de réception', () => {
  it('le planificateur garde 15 blocs : les ok suivants attendent qu\'une place se libère ; les commandes $ passent', () => {
    const { g, tx, take } = rig();
    for (let i = 1; i <= 15; i++) g.receive(`G1 X${i} F600\n`);
    expect((take().match(/ok/g) ?? []).length).toBe(15);
    expect(tx('$G')).toContain('[GC:'); // la file est pleine mais la commande $ passe
    for (let i = 16; i <= 20; i++) g.receive(`G1 X${i} F600\n`);
    expect(take()).toBe('');
    g.step(0.35); // 1 mm = 0,1 s : trois blocs finis
    expect((take().match(/ok/g) ?? []).length).toBe(3);
    g.step(100);
    expect((take().match(/ok/g) ?? []).length).toBe(2);
    g.step(100); // les deux derniers blocs, entrés en fin de pas
    expect(g.state).toBe('Idle');
  });
  it('compte les octets en attente : plus de 127 = débordement signalé', () => {
    const { g } = rig();
    const line = 'G1 X' + '1'.repeat(46) + ' F600'; // 55 caractères, 56 octets avec le saut de ligne
    for (let i = 0; i < 15; i++) g.receive(line + '\n'); // elles passent aussitôt : rien n'attend
    expect(g.maxPending).toBe(56);
    g.receive(line + '\n'); g.receive(line + '\n'); // la file est pleine : les suivantes s'accumulent (112 octets)
    expect(g.overflowed).toBe(false);
    g.receive(line + '\n');
    expect(g.maxPending).toBe(168);
    expect(g.overflowed).toBe(true);
  });
  it('lit des lignes coupées entre deux envois', () => {
    const { g, take } = rig();
    g.receive('G0 X');
    expect(take()).toBe('');
    g.receive('5\n');
    expect(take()).toBe('ok\r\n');
  });
});

describe('MockTransport', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('libellé selon l\'accélération, nature « mock »', () => {
    expect(new MockTransport().label).toBe('Machine simulée');
    expect(new MockTransport({ speedup: 5 }).label).toBe('Machine simulée (×5)');
    expect(new MockTransport().kind).toBe('mock');
  });
  it('write avant open : « Port fermé »', async () => {
    await expect(new MockTransport().write('?')).rejects.toThrow('Port fermé');
  });
  it('open : bienvenue après 30 ms, réponses livrées de façon asynchrone, horloge accélérée', async () => {
    const t = new MockTransport({ speedup: 10 });
    let text = '';
    t.onData = (c) => { text += c; };
    await t.open();
    expect(text).toBe('');
    await vi.advanceTimersByTimeAsync(30);
    expect(text).toContain('Grbl 1.1h');
    text = '';
    await t.write('G1 X100 F600\n');
    await Promise.resolve();
    expect(text).toBe('ok\r\n');
    await vi.advanceTimersByTimeAsync(1000); // 1 s réelle × 10 = 10 s simulées = 100 mm
    expect(t.grbl.mpos.x).toBeCloseTo(100, 0);
    await t.close();
  });
  it('close arrête l\'horloge et les sorties ; dropLink prévient d\'une perte inattendue', async () => {
    const t = new MockTransport();
    let text = '';
    t.onData = (c) => { text += c; };
    const closes: unknown[] = [];
    t.onClose = (u, r) => closes.push([u, r]);
    await t.open();
    await vi.advanceTimersByTimeAsync(40);
    text = '';
    await t.write('G1 X100 F60\n');
    await t.close();
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.grbl.mpos.x).toBe(0);
    await expect(t.write('?')).rejects.toThrow('Port fermé');
    t.grbl.out('encore'); // sortie ignorée une fois fermée
    await Promise.resolve();
    expect(text).toBe('ok\r\n');
    expect(closes).toEqual([]);
    const u = new MockTransport();
    u.onClose = (x, r) => closes.push([x, r]);
    await u.open();
    u.dropLink();
    expect(closes).toEqual([[true, 'câble débranché (simulé)']]);
    u.onClose = null;
    u.dropLink(); // sans écouteur : sans erreur
  });
});
