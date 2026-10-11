import { describe, expect, it } from 'vitest';
import {
  ALARM_MESSAGES, DEFAULT_RAPID, ERROR_MESSAGES, Emitter, RT, RX_BUFFER, TEST_MARGIN, Writer, alarmMessage, buildFrame, buildTestCard, cleanLine,
  epilogue, errorMessage, formatDuration, gcodeText, isWelcome, jogLine, parseSetting, parseStatus, powerToS, prologue, spread, stateLabel,
} from '../src';
import type { GrblStatus } from '../src';

describe('Emitter', () => {
  it('prévient les abonnés dans l\'ordre, se désabonne, et se vide', () => {
    const e = new Emitter<number>();
    const got: string[] = [];
    const off = e.on((v) => got.push(`a${v}`));
    e.on((v) => got.push(`b${v}`));
    e.emit(1);
    off();
    e.emit(2);
    expect(got).toEqual(['a1', 'b1', 'b2']);
    e.clear();
    e.emit(3);
    expect(got).toHaveLength(3);
  });
  it('un abonné qui se désabonne pendant l\'émission ne perturbe pas les autres', () => {
    const e = new Emitter<void>();
    const got: string[] = [];
    const off = e.on(() => { got.push('a'); off(); });
    e.on(() => got.push('b'));
    e.emit();
    e.emit();
    expect(got).toEqual(['a', 'b', 'b']);
  });
});

describe('messages GRBL', () => {
  it('donne le texte connu ou un texte générique avec le code', () => {
    expect(errorMessage(9)).toBe(ERROR_MESSAGES[9]);
    expect(errorMessage(9)).toContain('alarme');
    expect(errorMessage(999)).toBe('Erreur GRBL 999.');
    expect(alarmMessage(3)).toBe(ALARM_MESSAGES[3]);
    expect(alarmMessage(3)).toContain('Réinitialisation');
    expect(alarmMessage(42)).toBe('Alarme GRBL 42.');
  });
  it('constantes du protocole', () => {
    expect(RT).toEqual({ status: '?', hold: '!', resume: '~', reset: '\x18', jogCancel: '\x85' });
    expect(RX_BUFFER).toBe(127);
  });
});

describe('lecture du statut (cas limites)', () => {
  it('position de travail seule : la machine = travail + WCO connu', () => {
    const s = parseStatus('<Idle|WPos:1,2,3>', { x: 10, y: 20, z: 30 })!;
    expect(s.mpos).toEqual({ x: 11, y: 22, z: 33 });
    expect(s.wpos).toEqual({ x: 1, y: 2, z: 3 });
    expect(s.wco).toEqual({ x: 10, y: 20, z: 30 });
    expect(s.sub).toBeNull();
  });
  it('position machine seule sans WCO : travail = machine ; z absent = 0', () => {
    const s = parseStatus('<Run|MPos:5,6>')!;
    expect(s.mpos).toEqual({ x: 5, y: 6, z: 0 });
    expect(s.wpos).toEqual({ x: 5, y: 6, z: 0 });
  });
  it('le WCO du rapport remplace l\'ancien ; un WCO illisible garde l\'ancien', () => {
    const a = parseStatus('<Idle|MPos:10,10,0|WCO:4,3,0>', { x: 1, y: 1, z: 1 })!;
    expect(a.wco).toEqual({ x: 4, y: 3, z: 0 });
    expect(a.wpos).toEqual({ x: 6, y: 7, z: 0 });
    const b = parseStatus('<Idle|MPos:10,10,0|WCO:abc>', { x: 1, y: 1, z: 1 })!;
    expect(b.wco).toEqual({ x: 1, y: 1, z: 1 });
    expect(b.wpos).toEqual({ x: 9, y: 9, z: -1 });
  });
  it('avance et puissance : FS, F seul, valeurs illisibles = 0', () => {
    expect(parseStatus('<Run|MPos:0,0,0|FS:1200,800>')).toMatchObject({ feed: 1200, spindle: 800 });
    expect(parseStatus('<Run|MPos:0,0,0|F:700>')).toMatchObject({ feed: 700, spindle: 0 });
    expect(parseStatus('<Run|MPos:0,0,0|F:x>')).toMatchObject({ feed: 0 });
    expect(parseStatus('<Run|MPos:0,0,0|FS:a,b>')).toMatchObject({ feed: 0, spindle: 0 });
  });
  it('champs sans « : » et champs inconnus ignorés', () => {
    const s = parseStatus('<Idle|MPos:1,1,0|Bf|Ov:100,100,100|Pn:XY>')!;
    expect(s.state).toBe('Idle');
    expect(s.mpos.x).toBe(1);
  });
  it('rejette : état inconnu, pas de position, position mal formée, pas de chevrons', () => {
    expect(parseStatus('<Bidule|MPos:0,0,0>')).toBeNull();
    expect(parseStatus('<Idle>')).toBeNull();
    expect(parseStatus('<Idle|MPos:5>')).toBeNull();
    expect(parseStatus('<Idle|MPos:1,x,0>')).toBeNull();
    expect(parseStatus('Idle|MPos:0,0,0')).toBeNull();
    expect(parseStatus('')).toBeNull();
  });
  it('accepte espaces autour et sous-état', () => {
    expect(parseStatus('  <Hold:0|MPos:0,0,0>\r')!.sub).toBe(0);
    expect(parseStatus('<Door:3|MPos:0,0,0>')!.sub).toBe(3);
  });
  it('lit les neuf états', () => {
    for (const st of ['Idle', 'Run', 'Hold', 'Jog', 'Alarm', 'Door', 'Check', 'Home', 'Sleep']) expect(parseStatus(`<${st}|MPos:0,0,0>`)!.state).toBe(st);
  });
});

describe('réglages, accueil, libellés', () => {
  it('parseSetting', () => {
    expect(parseSetting('$30=1000')).toEqual([30, 1000]);
    expect(parseSetting('$11=0.010')).toEqual([11, 0.01]);
    expect(parseSetting(' $5=-1 ')).toEqual([5, -1]);
    expect(parseSetting('30=1000')).toBeNull();
    expect(parseSetting('$30=abc')).toBeNull();
  });
  it('isWelcome', () => {
    expect(isWelcome("Grbl 1.1h ['$' for help]")).toBe(true);
    expect(isWelcome('grbl 1.1')).toBe(true);
    expect(isWelcome('Grblx')).toBe(false);
    expect(isWelcome('ok')).toBe(false);
  });
  it('stateLabel', () => {
    const st = (state: GrblStatus['state']) => ({ state } as GrblStatus);
    expect(stateLabel(st('Idle'), false)).toBe('Déconnectée');
    expect(stateLabel(null, true)).toBe('En attente…');
    const expected: Record<GrblStatus['state'], string> = {
      Idle: 'Inactive', Run: 'En marche', Jog: 'Déplacement', Hold: 'Pause', Alarm: 'Alarme', Door: 'Porte ouverte', Check: 'Mode test', Home: 'Homing', Sleep: 'Veille',
    };
    for (const [k, v] of Object.entries(expected)) expect(stateLabel(st(k as GrblStatus['state']), true)).toBe(v);
  });
});

describe('gcode.ts : cas limites', () => {
  it('cleanLine retire les deux sortes de commentaires et compacte les espaces', () => {
    expect(cleanLine('G1  X1 (rapide) Y2 ; fin')).toBe('G1 X1 Y2');
    expect(cleanLine('(tout)')).toBe('');
    expect(cleanLine('  ;x')).toBe('');
  });
  it('powerToS : plafond, S max, négatif, > 100 %', () => {
    expect(powerToS(50, 1000, 80)).toBe(500);
    expect(powerToS(100, 1000, 80)).toBe(800);
    expect(powerToS(-5, 1000, 80)).toBe(0);
    expect(powerToS(150, 1000, 200)).toBe(1000);
    expect(powerToS(100, 500, 100)).toBe(500);
    expect(powerToS(33.3, 1000, 100)).toBe(333);
  });
  it('spread : un seul, plusieurs, arrondi', () => {
    expect(spread(10.4, 50, 1)).toEqual([10]);
    expect(spread(10, 50, 0)).toEqual([10]);
    expect(spread(0, 10, 3)).toEqual([0, 5, 10]);
    expect(spread(0, 10, 4)).toEqual([0, 3, 7, 10]);
  });
  it('formatDuration : secondes, minutes, heures, négatif, arrondi', () => {
    expect(formatDuration(35)).toBe('35 s');
    expect(formatDuration(252)).toBe('4 min 12 s');
    expect(formatDuration(60)).toBe('1 min 00 s');
    expect(formatDuration(3720)).toBe('1 h 02 min');
    expect(formatDuration(7200)).toBe('2 h 00 min');
    expect(formatDuration(-5)).toBe('0 s');
    expect(formatDuration(34.6)).toBe('35 s');
  });
  it('jogLine : relatif, jamais de laser, pas de -0', () => {
    expect(jogLine(10, -5, 3000)).toBe('$J=G91 G21 X10 Y-5 F3000');
    expect(jogLine(-0, 0.12345, 100)).toBe('$J=G91 G21 X0 Y0.123 F100');
    expect(jogLine(-0.0001, 0, 100)).toBe('$J=G91 G21 X0 Y0 F100');
  });
  it('gcodeText : en-tête commenté puis lignes, saut de ligne final', () => {
    const f = buildFrame({ minX: 0, minY: 0, maxX: 5, maxY: 5 });
    const t = gcodeText(f);
    expect(t.startsWith('; Cadre à vide')).toBe(true);
    expect(t.endsWith('\n')).toBe(true);
    expect(t.split('\n').slice(1, 3)).toEqual(['M5', '$J=G90 G21 X0 Y0 F3000']);
  });
  it('buildFrame : tour exact du rectangle puis retour à l\'origine, bornes = boîte, durée > 0', () => {
    const f = buildFrame({ minX: 10, minY: 20, maxX: 40, maxY: 60 }, 6000);
    expect(f.lines).toEqual([
      'M5',
      '$J=G90 G21 X10 Y20 F6000', '$J=G90 G21 X40 Y20 F6000', '$J=G90 G21 X40 Y60 F6000', '$J=G90 G21 X10 Y60 F6000', '$J=G90 G21 X10 Y20 F6000',
      '$J=G90 G21 X0 Y0 F6000',
    ]);
    expect(f.stats.bounds).toEqual({ minX: 10, minY: 20, maxX: 40, maxY: 60 });
    expect(f.stats.rapidMm).toBeCloseTo(Math.hypot(10, 20) + 30 + 40 + 30 + 40 + Math.hypot(10, 20), 6);
    expect(f.stats.seconds).toBeCloseTo((f.stats.rapidMm / 6000) * 60, 6);
    expect(f.segments).toHaveLength(6);
    expect(f.segments.every((s) => !s.cut)).toBe(true);
    expect(f.lineTimes).toHaveLength(f.lines.length);
    expect(f.lines.some((l) => /\bS\d/.test(l))).toBe(false);
  });
  it('Writer : un rapide vers la position courante ne produit rien ; sans coupe, pas de bornes', () => {
    const w = new Writer(6000, 100, 100);
    w.rapid(0, 0, true);
    expect(w.lines).toEqual([]);
    expect(w.stats(0, false).bounds).toBeNull();
    expect(w.stats(0, false).outOfBounds).toBe(false);
  });
  it('Writer : gravure marquée dans les segments, hors planche détecté sur chaque bord', () => {
    const sq = (x: number, y: number, s: number): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
    const run = (pts: [number, number][]) => { const w = new Writer(6000, 100, 80); w.cut(pts, 600, 100, true, true); return w; };
    const ok = run(sq(10, 10, 20));
    expect(ok.segments.filter((s) => s.cut && s.engrave)).toHaveLength(4);
    expect(ok.stats(1, false).outOfBounds).toBe(false);
    expect(run(sq(-1, 10, 20)).stats(1, false).outOfBounds).toBe(true);
    expect(run(sq(10, -1, 20)).stats(1, false).outOfBounds).toBe(true);
    expect(run(sq(90, 10, 20)).stats(1, false).outOfBounds).toBe(true);
    expect(run(sq(10, 70, 20)).stats(1, false).outOfBounds).toBe(true);
    const plain = new Writer(6000, 100, 80);
    plain.cut(sq(10, 10, 5), 600, 100, true);
    expect(plain.segments.some((s) => 'engrave' in s)).toBe(false);
    const norec = new Writer(6000, 100, 80);
    norec.cut(sq(10, 10, 5), 600, 100, false);
    expect(norec.segments).toEqual([]);
  });
  it('prologue et epilogue exacts', () => {
    const w = new Writer(DEFAULT_RAPID, 100, 100);
    prologue(w);
    expect(w.lines).toEqual(['G21', 'G90', 'G54', 'G94', 'M5', 'M4 S0']);
    w.rapid(10, 0, false);
    epilogue(w);
    expect(w.lines.slice(-4)).toEqual(['G0 X10 Y0', 'M5', 'G0 X0 Y0', 'M5']);
  });
  it('planche d\'essai : positions, S par cellule, plafonnement, ne tient pas, passes arrondies', () => {
    const r = buildTestCard({ W: 410, H: 400, speeds: [100, 200], powers: [50, 100], size: 10, gap: 4, passes: 2, sMax: 1000, capPct: 80 });
    expect(r.cells.map((c) => [c.x, c.y, c.s, c.clamped])).toEqual([
      [TEST_MARGIN, TEST_MARGIN, 500, false], [TEST_MARGIN + 14, TEST_MARGIN, 500, false],
      [TEST_MARGIN, TEST_MARGIN + 14, 800, true], [TEST_MARGIN + 14, TEST_MARGIN + 14, 800, true],
    ]);
    expect(r.job.stats.clamped).toBe(true);
    expect(r.job.stats.maxS).toBe(800);
    expect(r.fits).toBe(true);
    expect(r.job.lines.filter((l) => l.startsWith('G1') && l.includes('F100 S500'))).toHaveLength(2); // deux passes
    expect(r.job.header[0]).toContain('Planche d\'essai');
    expect(r.job.header[1]).toBe('X5 Y5 : F100 S500 (50 %)');
    const small = buildTestCard({ W: 20, H: 20, speeds: [100, 200, 300], powers: [10], size: 10, gap: 4, passes: 0.2, sMax: 1000, capPct: 100, rapidFeed: 3000 });
    expect(small.fits).toBe(false);
    expect(small.job.stats.clamped).toBe(false);
    expect(small.job.lines.filter((l) => l.includes(' F100 ')).length).toBe(1); // passes < 1 → au moins 1 passe
  });
});
