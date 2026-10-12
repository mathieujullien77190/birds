import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MACHINE_SETTINGS, FEED_RANGE, JOG_STEPS, MACHINE_SETTINGS_KEY, WebSerialTransport, isWebSerialSupported, latin1, parseMachineSettings, saveSvg, saveText, webSerialProblem,
} from '../src';

afterEach(() => { vi.unstubAllGlobals(); });

describe('constants', () => {
  it('valeurs de départ prudentes et cohérentes avec les bornes', () => {
    expect(MACHINE_SETTINGS_KEY).toBe('laser-reglages');
    expect([...JOG_STEPS]).toEqual([0.1, 1, 10, 50]);
    expect(FEED_RANGE).toEqual({ min: 20, max: 3000 });
    const d = DEFAULT_MACHINE_SETTINGS;
    expect(d.feed).toBeGreaterThanOrEqual(FEED_RANGE.min);
    expect(d.feed).toBeLessThanOrEqual(FEED_RANGE.max);
    expect(d.capPct).toBe(80);
    expect(d.passMode).toBe('all');
    expect(JOG_STEPS).toContain(d.jogStep as 10);
    expect(d.test.speedMin).toBeLessThan(d.test.speedMax);
    expect(d.test.powerMax).toBeLessThanOrEqual(d.capPct);
  });
});

describe('parseMachineSettings', () => {
  const D = DEFAULT_MACHINE_SETTINGS;
  it('rien, texte invalide, JSON qui n\'est pas un objet : valeurs par défaut', () => {
    expect(parseMachineSettings(null)).toEqual(D);
    expect(parseMachineSettings('')).toEqual(D);
    expect(parseMachineSettings('pas du json')).toEqual(D);
    expect(parseMachineSettings('null')).toEqual(D);
    expect(parseMachineSettings('42')).toEqual(D);
    expect(parseMachineSettings('"x"')).toEqual(D);
    expect(parseMachineSettings('[1,2]')).toEqual(D);
    expect(parseMachineSettings('{}')).toEqual(D);
  });
  it('un objet complet valide revient tel quel (aller-retour JSON)', () => {
    const custom = { ...D, feed: 450, power: 75, passes: 5, passMode: 'contour' as const, capPct: 90, jogFeed: 1000, jogStep: 1, engraveFeed: 2000, engravePower: 20, frameMode: 'sheet' as const, test: { ...D.test, size: 12 } };
    expect(parseMachineSettings(JSON.stringify(custom))).toEqual(custom);
  });
  it('assistance d air : éteinte par défaut, vraie seulement si le texte stocké dit exactement true', () => {
    expect(D.air).toBe(false);
    expect(parseMachineSettings('{"air":true}').air).toBe(true);
    for (const v of ['1', '"true"', 'null', '0', 'false']) expect(parseMachineSettings(`{"air":${v}}`).air, v).toBe(false);
  });
  it('chaque champ numérique est ramené dans ses bornes', () => {
    const hi = parseMachineSettings(JSON.stringify({ feed: 99999, power: 500, passes: 99, capPct: 500, jogFeed: 99999, engraveFeed: 99999, engravePower: 500 }));
    expect([hi.feed, hi.power, hi.passes, hi.capPct, hi.jogFeed, hi.engraveFeed, hi.engravePower]).toEqual([6000, 100, 20, 100, 6000, 6000, 100]);
    const lo = parseMachineSettings(JSON.stringify({ feed: -5, power: -5, passes: 0, capPct: 0, jogFeed: 1, engraveFeed: 0, engravePower: -1 }));
    expect([lo.feed, lo.power, lo.passes, lo.capPct, lo.jogFeed, lo.engraveFeed, lo.engravePower]).toEqual([1, 0, 1, 1, 50, 1, 0]);
  });
  it('passes arrondi', () => {
    expect(parseMachineSettings('{"passes":2.6}').passes).toBe(3);
    expect(parseMachineSettings('{"passes":2.4}').passes).toBe(2);
  });
  it('types erronés (texte, null, NaN, Infinity) : valeur par défaut du champ', () => {
    const s = parseMachineSettings('{"feed":"vite","power":null,"passes":true,"capPct":{},"jogFeed":[1]}');
    expect([s.feed, s.power, s.passes, s.capPct, s.jogFeed]).toEqual([D.feed, D.power, D.passes, D.capPct, D.jogFeed]);
    expect(parseMachineSettings('{"feed":1e999}').feed).toBe(D.feed); // 1e999 → Infinity en JS
  });
  it('mode de passes, mode de cadre, pas manuel : seulement les valeurs permises', () => {
    expect(parseMachineSettings('{"passMode":"contour"}').passMode).toBe('contour');
    expect(parseMachineSettings('{"passMode":"autre"}').passMode).toBe('all');
    expect(parseMachineSettings('{"frameMode":"sheet"}').frameMode).toBe('sheet');
    expect(parseMachineSettings('{"frameMode":"autre"}').frameMode).toBe('pieces');
    for (const st of [0.1, 1, 10, 50]) expect(parseMachineSettings(`{"jogStep":${st}}`).jogStep).toBe(st);
    expect(parseMachineSettings('{"jogStep":7}').jogStep).toBe(D.jogStep);
    expect(parseMachineSettings('{"jogStep":"10"}').jogStep).toBe(D.jogStep);
  });
  it('planche d\'essai : bornes, arrondis, objet absent ou nul', () => {
    const hi = parseMachineSettings(JSON.stringify({ test: { speedMin: 99999, speedMax: 99999, speedCount: 99, powerMin: 500, powerMax: 500, powerCount: 99, size: 99, passes: 99 } })).test;
    expect(hi).toEqual({ speedMin: 6000, speedMax: 6000, speedCount: 8, powerMin: 100, powerMax: 100, powerCount: 8, size: 30, passes: 20 });
    const lo = parseMachineSettings(JSON.stringify({ test: { speedMin: 0, speedMax: 0, speedCount: 0, powerMin: 0, powerMax: 0, powerCount: 0, size: 0, passes: 0 } })).test;
    expect(lo).toEqual({ speedMin: 10, speedMax: 10, speedCount: 1, powerMin: 1, powerMax: 1, powerCount: 1, size: 5, passes: 1 });
    expect(parseMachineSettings('{"test":null}').test).toEqual(D.test);
    expect(parseMachineSettings('{"test":{"speedMin":200}}').test).toEqual({ ...D.test, speedMin: 200 });
    expect(parseMachineSettings('{"test":{"speedCount":3.5}}').test.speedCount).toBe(4);
  });
});

describe('téléchargements', () => {
  function stubDom() {
    const created: { href?: string; download?: string; click: ReturnType<typeof vi.fn> }[] = [];
    vi.stubGlobal('document', { createElement: (tag: string) => { expect(tag).toBe('a'); const a = { click: vi.fn() }; created.push(a); return a; } });
    const blobs: Blob[] = [];
    const revoked: string[] = [];
    vi.stubGlobal('URL', { createObjectURL: (b: Blob) => { blobs.push(b); return 'blob:fake-' + blobs.length; }, revokeObjectURL: (u: string) => revoked.push(u) });
    return { created, blobs, revoked };
  }
  it('saveSvg : lien de téléchargement SVG cliqué puis libéré', async () => {
    const { created, blobs, revoked } = stubDom();
    saveSvg('<svg/>', 'planche.svg');
    expect(created).toHaveLength(1);
    expect(created[0].href).toBe('blob:fake-1');
    expect(created[0].download).toBe('planche.svg');
    expect(created[0].click).toHaveBeenCalledTimes(1);
    expect(blobs[0].type).toBe('image/svg+xml');
    expect(await blobs[0].text()).toBe('<svg/>');
    expect(revoked).toEqual(['blob:fake-1']);
  });
  it('saveText : texte brut', async () => {
    const { created, blobs, revoked } = stubDom();
    saveText('G21\nM5\n', 'job.gcode');
    expect(created[0].download).toBe('job.gcode');
    expect(created[0].click).toHaveBeenCalledTimes(1);
    expect(blobs[0].type).toBe('text/plain');
    expect(await blobs[0].text()).toBe('G21\nM5\n');
    expect(revoked).toEqual(['blob:fake-1']);
  });
});

describe('Web Serial : détection', () => {
  it('sans navigateur', () => {
    vi.stubGlobal('navigator', undefined);
    expect(isWebSerialSupported()).toBe(false);
    expect(webSerialProblem()).toBe('Pas de navigateur.');
  });
  it('navigateur sans API série', () => {
    vi.stubGlobal('navigator', {});
    expect(isWebSerialSupported()).toBe(false);
    expect(webSerialProblem()).toContain('API Web Serial absente');
  });
  it('API présente sans fenêtre (outil en ligne de commande) : utilisable', () => {
    vi.stubGlobal('navigator', { serial: {} });
    expect(isWebSerialSupported()).toBe(true);
    expect(webSerialProblem()).toBeNull();
  });
  it('page non sécurisée / sécurisée', () => {
    vi.stubGlobal('navigator', { serial: {} });
    vi.stubGlobal('window', { isSecureContext: false });
    expect(isWebSerialSupported()).toBe(false);
    expect(webSerialProblem()).toBe('Le pilotage USB demande une page en HTTPS ou sur localhost.');
    vi.stubGlobal('window', { isSecureContext: true });
    expect(isWebSerialSupported()).toBe(true);
    expect(webSerialProblem()).toBeNull();
  });
  it('latin1 : un caractère = un octet, y compris 0x85 et 0x18 ; au-delà de 0xFF tronqué', () => {
    expect([...latin1('?!\x18\x85')]).toEqual([0x3f, 0x21, 0x18, 0x85]);
    expect([...latin1('Ł')]).toEqual([0x41]);
    expect(latin1('')).toHaveLength(0);
  });
});

/** Port série factice avec des flux contrôlés à la main. */
function fakePort(opt: { info?: { usbVendorId?: number; usbProductId?: number } | null; noReadable?: boolean; noWritable?: boolean } = {}) {
  const listeners: Record<string, (() => void)[]> = {};
  const written: Uint8Array[] = [];
  const reads: ({ value?: Uint8Array; done: boolean } | Error)[] = [];
  let wake: (() => void) | null = null;
  const events: string[] = [];
  const reader = {
    read: async (): Promise<{ value?: Uint8Array; done: boolean }> => {
      for (;;) {
        const r = reads.shift();
        if (r instanceof Error) throw r;
        if (r) return r;
        await new Promise<void>((res) => { wake = res; });
      }
    },
    cancel: vi.fn(async () => { events.push('cancel'); }),
    releaseLock: vi.fn(() => { events.push('releaseReader'); }),
  };
  const writer = { write: vi.fn(async (b: Uint8Array) => { written.push(b); }), releaseLock: vi.fn(() => { events.push('releaseWriter'); }) };
  const port = {
    open: vi.fn(async () => { events.push('open'); }),
    close: vi.fn(async () => { events.push('close'); }),
    readable: opt.noReadable ? null : { getReader: () => reader },
    writable: opt.noWritable ? null : { getWriter: () => writer },
    addEventListener: vi.fn((t: string, cb: () => void) => { (listeners[t] ??= []).push(cb); }),
    removeEventListener: vi.fn((t: string, cb: () => void) => { listeners[t] = (listeners[t] ?? []).filter((x) => x !== cb); }),
    ...(opt.info === null ? {} : { getInfo: () => opt.info ?? {} }),
  };
  const push = (r: { value?: Uint8Array; done: boolean } | Error) => { reads.push(r); wake?.(); };
  return { port, reader, writer, listeners, written, push, events };
}

async function flush() { for (let i = 0; i < 5; i++) await Promise.resolve(); }

describe('WebSerialTransport', () => {
  function setup(opt?: Parameters<typeof fakePort>[0]) {
    const fp = fakePort(opt);
    const requestPort = vi.fn(async () => fp.port);
    vi.stubGlobal('navigator', { serial: { requestPort } });
    const t = new WebSerialTransport();
    const closes: unknown[] = [];
    t.onClose = (u, r) => closes.push([u, r]);
    const data: string[] = [];
    t.onData = (c) => data.push(c);
    return { fp, t, closes, data, requestPort };
  }

  it('open : demande le port, 115200 8N1 sans contrôle de flux, étiquette avec l\'identifiant USB, écoute la déconnexion', async () => {
    const { fp, t, requestPort } = setup({ info: { usbVendorId: 0x1a86, usbProductId: 0x7523 } });
    expect(t.kind).toBe('serial');
    expect(t.label).toBe('Port USB');
    await t.open();
    expect(requestPort).toHaveBeenCalledTimes(1);
    expect(fp.port.open).toHaveBeenCalledWith({ baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none', bufferSize: 4096 });
    expect(t.label).toBe('Port USB 1a86:7523');
    expect(fp.listeners.disconnect).toHaveLength(1);
  });
  it('étiquette : produit absent = 0 ; fabricant absent ou nul, ou pas de getInfo : étiquette par défaut', async () => {
    const a = setup({ info: { usbVendorId: 0x2341 } });
    await a.t.open();
    expect(a.t.label).toBe('Port USB 2341:0');
    const b = setup({ info: {} });
    await b.t.open();
    expect(b.t.label).toBe('Port USB');
    const c = setup({ info: null });
    await c.t.open();
    expect(c.t.label).toBe('Port USB');
  });
  it('open sans API : message du problème (et pas de port demandé)', async () => {
    vi.stubGlobal('navigator', {});
    await expect(new WebSerialTransport().open()).rejects.toThrow('API Web Serial absente');
  });
  it('open : port sans flux lisible ou inscriptible = erreur claire', async () => {
    await expect(setup({ noReadable: true }).t.open()).rejects.toThrow('Port série sans flux lisible / inscriptible');
    await expect(setup({ noWritable: true }).t.open()).rejects.toThrow('Port série sans flux lisible / inscriptible');
  });
  it('lecture : octets décodés en texte, paquets vides ignorés, sans écouteur sans erreur', async () => {
    const { fp, t, data } = setup();
    await t.open();
    fp.push({ value: new TextEncoder().encode('ok\r\n'), done: false });
    fp.push({ value: new Uint8Array(0), done: false });
    fp.push({ value: undefined, done: false });
    fp.push({ value: new TextEncoder().encode('<Idle>'), done: false });
    await flush();
    expect(data).toEqual(['ok\r\n', '<Idle>']);
    t.onData = null;
    fp.push({ value: new TextEncoder().encode('x'), done: false });
    await flush();
    expect(data).toHaveLength(2);
  });
  it('write : octets latin-1 ; avant open ou après fermeture : « Port fermé »', async () => {
    const { fp, t } = setup();
    await expect(t.write('?')).rejects.toThrow('Port fermé');
    await t.open();
    await t.write('G0 X1\n\x18\x85');
    expect([...fp.written[0]]).toEqual([...new TextEncoder().encode('G0 X1\n'), 0x18, 0x85]);
    await t.close();
    await expect(t.write('?')).rejects.toThrow('Port fermé');
  });
  it('close : libère tout dans l\'ordre (annule la lecture, libère les verrous, ferme le port), retire l\'écouteur, onClose(false) ; le flux qui se termine ensuite ne signale rien', async () => {
    const { fp, t, closes } = setup();
    await t.open();
    await t.close();
    expect(fp.events).toEqual(['open', 'cancel', 'releaseReader', 'releaseWriter', 'close']);
    expect(fp.listeners.disconnect).toEqual([]);
    expect(closes).toEqual([[false, undefined]]);
    fp.push({ done: true });
    await flush();
    expect(closes).toHaveLength(1);
  });
  it('close avant open ou sans écouteur : sans erreur', async () => {
    const t = new WebSerialTransport();
    await t.close();
    t.onClose = null;
    await t.close();
  });
  it('close : les erreurs de libération sont ignorées', async () => {
    const { fp, t, closes } = setup();
    await t.open();
    fp.reader.cancel.mockRejectedValue(new Error('x'));
    fp.reader.releaseLock.mockImplementation(() => { throw new Error('y'); });
    fp.writer.releaseLock.mockImplementation(() => { throw new Error('z'); });
    fp.port.close.mockRejectedValue(new Error('w'));
    await t.close();
    expect(closes).toEqual([[false, undefined]]);
  });
  it('flux terminé par le port : onClose inattendu « flux terminé » après libération', async () => {
    const { fp, t, closes } = setup();
    await t.open();
    fp.push({ done: true });
    await flush();
    expect(closes).toEqual([[true, 'flux terminé']]);
    expect(fp.events).toContain('close');
    await expect(t.write('?')).rejects.toThrow('Port fermé');
  });
  it('erreur de lecture : message de l\'erreur', async () => {
    const a = setup();
    await a.t.open();
    a.fp.push(new Error('périphérique retiré'));
    await flush();
    expect(a.closes).toEqual([[true, 'périphérique retiré']]);
  });
  it('erreur de lecture qui n\'est pas une Error : « erreur de lecture »', async () => {
    const fp = fakePort();
    fp.reader.read = async () => { throw 'texte'; };
    vi.stubGlobal('navigator', { serial: { requestPort: async () => fp.port } });
    const t = new WebSerialTransport();
    const closes: unknown[] = [];
    t.onClose = (u, r) => closes.push([u, r]);
    await t.open();
    await flush();
    expect(closes).toEqual([[true, 'erreur de lecture']]);
  });
  it('déconnexion du port (évènement) : onClose inattendu « port déconnecté », une seule fois', async () => {
    const { fp, t, closes } = setup();
    await t.open();
    fp.listeners.disconnect[0]();
    fp.listeners.disconnect[0]?.();
    await flush();
    expect(closes).toEqual([[true, 'port déconnecté']]);
  });
  it('déconnexion sans écouteur onClose : sans erreur', async () => {
    const { fp, t } = setup();
    await t.open();
    t.onClose = null;
    fp.listeners.disconnect[0]();
    await flush();
  });
});
