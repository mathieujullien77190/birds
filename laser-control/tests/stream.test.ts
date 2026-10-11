import { describe, expect, it } from 'vitest';
import { GcodeStreamer, GrblClient, MockTransport, RT, buildGcode, parseStatus, type LaserJob } from '../src';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function until(cond: () => boolean, ms = 8000) {
  const t0 = Date.now();
  while (!cond()) { if (Date.now() - t0 > ms) throw new Error('délai dépassé'); await sleep(10); }
}

/** Un carré de 40 mm et trois petits carrés : de quoi dépasser largement 127 octets de G-code. */
const JOB: LaserJob = {
  widthMm: 200, heightMm: 200,
  layers: { cut: [
    [[10, 10], [50, 10], [50, 50], [10, 50]],
    [[70, 10], [80, 10], [80, 20], [70, 20]],
    [[90, 10], [100, 10], [100, 20], [90, 20]],
    [[110, 10], [120, 10], [120, 20], [110, 20]],
  ] },
};
const OPT = { feed: 6000, powerPct: 50, passes: 3, passMode: 'all' as const, sMax: 1000, capPct: 80 };

async function setup(speedup = 100) {
  const transport = new MockTransport({ speedup });
  const client = new GrblClient(transport, { pollMs: 40 });
  const welcomed = new Promise<void>((r) => client.onWelcome.on(() => r()));
  await client.connect();
  await welcomed; // le message « Grbl 1.1h » arrive après l'ouverture ; il vide la file : on attend qu'il soit passé
  await until(() => client.settings[30] !== undefined);
  await sleep(120); // relecture de `$` après la réinitialisation
  return { transport, client, grbl: transport.grbl };
}

describe('lecture du statut', () => {
  it('lit état, positions, avance et puissance', () => {
    const s = parseStatus('<Run|MPos:10.000,20.500,0.000|FS:300,500|WCO:1.000,2.000,0.000>')!;
    expect(s.state).toBe('Run');
    expect(s.mpos).toMatchObject({ x: 10, y: 20.5 });
    expect(s.wpos).toMatchObject({ x: 9, y: 18.5 });
    expect(s.feed).toBe(300);
    expect(s.spindle).toBe(500);
    expect(parseStatus('<Hold:1|WPos:0,0,0>')!.sub).toBe(1);
    expect(parseStatus('pas un rapport')).toBeNull();
  });
});

describe('envoi en flux avec la machine simulée', () => {
  it('envoie tout le programme sans jamais dépasser le tampon de 127 octets, puis termine laser éteint', async () => {
    const { client, grbl } = await setup();
    const program = buildGcode(JOB, OPT);
    const s = new GcodeStreamer(client, program.lines);
    s.start();
    await until(() => s.snapshot().phase === 'draining' || s.snapshot().phase === 'done');
    await until(() => client.status?.state === 'Idle' && s.snapshot().acked === s.lines.length);
    s.machineIdle();
    expect(s.snapshot().phase).toBe('done');
    expect(s.snapshot().acked).toBe(program.lines.length);
    expect(grbl.overflowed).toBe(false);
    expect(grbl.maxPending).toBeLessThanOrEqual(127);
    expect(grbl.maxPending).toBeGreaterThan(40); // le tampon est bien rempli (pas un envoi ligne par ligne)
    expect(grbl.maxSOut).toBeLessThanOrEqual(800);
    expect(grbl.maxSSeen).toBe(500);
    expect(grbl.spindleOut).toBe(0);
    expect(grbl.mpos.x).toBeCloseTo(0, 2);
    expect(grbl.mpos.y).toBeCloseTo(0, 2);
    expect(grbl.executed[grbl.executed.length - 1]).toBe('M5');
    await client.disconnect();
  });

  it('pause (! puis arrêt de l\'envoi), reprise (~) et le programme va jusqu\'au bout', async () => {
    const { client, grbl } = await setup(30);
    const program = buildGcode(JOB, OPT);
    const s = new GcodeStreamer(client, program.lines);
    s.start();
    await until(() => grbl.state === 'Run');
    await client.realtime(RT.hold);
    s.pause();
    await until(() => grbl.state === 'Hold');
    expect(grbl.spindleOut).toBe(0); // en pause le laser est éteint
    const sent = s.snapshot().sent;
    await sleep(150);
    expect(s.snapshot().sent).toBe(sent); // plus rien n'est envoyé
    expect(s.snapshot().phase).toBe('paused');
    await client.realtime(RT.resume);
    s.resume();
    await until(() => s.snapshot().phase === 'draining' || s.snapshot().phase === 'done');
    await until(() => client.status?.state === 'Idle');
    s.machineIdle();
    expect(s.snapshot().phase).toBe('done');
    expect(grbl.overflowed).toBe(false);
    await client.disconnect();
  });

  it('arrêt : pause, réinitialisation douce, M5 ; plus aucun envoi et le laser est éteint', async () => {
    const { client, grbl } = await setup(30);
    const program = buildGcode(JOB, OPT);
    const s = new GcodeStreamer(client, program.lines);
    s.start();
    await until(() => grbl.state === 'Run');
    s.abort();
    await client.emergencyStop();
    expect(s.snapshot().phase).toBe('aborted');
    expect(grbl.spindleOut).toBe(0);
    expect(grbl.state === 'Alarm' || grbl.state === 'Idle').toBe(true); // alarme 3 si la tête bougeait
    const sent = s.snapshot().sent;
    await sleep(100);
    expect(s.snapshot().sent).toBe(sent);
    await client.disconnect();
  });

  it('une alarme ou une ligne refusée interrompt l\'envoi', async () => {
    const { client, grbl } = await setup(30);
    const s = new GcodeStreamer(client, ['G21', 'G90', 'G1 X10 Y10 F500 S100', 'G1 X20 Y20', 'M5']);
    s.start();
    await until(() => grbl.state === 'Run');
    grbl.triggerAlarm(1);
    await sleep(50);
    const r = await client.send('G0 X1 Y1');
    expect(r.ok).toBe(false); // error:9 : commandes bloquées en alarme
    await client.disconnect();
  });

  it('déplacement manuel (jog) puis « origine ici » dans la machine simulée', async () => {
    const { client, grbl } = await setup(50);
    expect((await client.send('$J=G91 G21 X5 Y3 F3000')).ok).toBe(true);
    await until(() => client.status?.state === 'Idle' && Math.abs(grbl.mpos.x - 5) < 0.01);
    expect(grbl.mpos.y).toBeCloseTo(3, 2);
    expect((await client.send('G10 L20 P1 X0 Y0')).ok).toBe(true);
    await until(() => client.status !== null && Math.abs(client.status.wpos.x) < 0.01);
    expect(client.status!.wpos.x).toBeCloseTo(0, 2);
    await client.disconnect();
  });
});
