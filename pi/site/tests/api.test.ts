import { describe, expect, it, vi } from 'vitest';
import { getHistory, getState, setAuto, setCamera, setFan, setLed } from '@/api';
import { makeState, point } from './fixtures';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const stub = (res: Response | (() => Promise<Response>)) => {
  const f = vi.fn(typeof res === 'function' ? res : async () => res);
  vi.stubGlobal('fetch', f);
  return f;
};
const body = (f: ReturnType<typeof vi.fn>) => JSON.parse(f.mock.calls[0][1].body);

describe('lecture', () => {
  it('getState appelle GET /api/etat et renvoie le JSON', async () => {
    const s = makeState({ t_nid: 31 });
    const f = stub(json(s));
    expect(await getState()).toEqual(s);
    expect(f).toHaveBeenCalledOnce();
    expect(f.mock.calls[0]).toEqual(['/api/etat']);
  });

  it('getHistory appelle GET /api/historique et renvoie la liste', async () => {
    const h = [point('10:00', 20, 15, 40)];
    const f = stub(json(h));
    expect(await getHistory()).toEqual(h);
    expect(f.mock.calls[0]).toEqual(['/api/historique']);
  });

  it.each([['getState', getState], ['getHistory', getHistory]])('%s rejette quand le JSON est invalide', async (_n, fn) => {
    stub(new Response('<html>oups</html>', { status: 200 }));
    await expect(fn()).rejects.toThrow();
  });

  it.each([['getState', getState], ['getHistory', getHistory]])('%s rejette sur une erreur HTTP sans JSON', async (_n, fn) => {
    stub(new Response('Internal Server Error', { status: 500 }));
    await expect(fn()).rejects.toThrow();
  });

  it.each([['getState', getState], ['getHistory', getHistory]])('%s rejette quand le réseau tombe', async (_n, fn) => {
    stub(async () => { throw new TypeError('Failed to fetch'); });
    await expect(fn()).rejects.toThrow('Failed to fetch');
  });
});

describe('commandes (POST JSON)', () => {
  const check = (f: ReturnType<typeof vi.fn>, url: string, expected: unknown) => {
    expect(f).toHaveBeenCalledOnce();
    expect(f.mock.calls[0][0]).toBe(url);
    expect(f.mock.calls[0][1].method).toBe('POST');
    expect(f.mock.calls[0][1].headers).toEqual({ 'Content-Type': 'application/json' });
    expect(body(f)).toEqual(expected);
  };

  it('setFan(pourcent > 0) envoie { pourcent }', async () => {
    const f = stub(json(makeState()));
    await setFan(65);
    check(f, '/api/ventilo', { pourcent: 65 });
  });

  it('setFan(0) envoie { mode: "arret" }', async () => {
    const f = stub(json(makeState()));
    await setFan(0);
    check(f, '/api/ventilo', { mode: 'arret' });
  });

  it('setLed("nid") et setLed("ext") envoient la bonne clé', async () => {
    let f = stub(json(makeState()));
    await setLed('nid', true);
    check(f, '/api/led', { nid: true });
    f = stub(json(makeState()));
    await setLed('ext', false);
    check(f, '/api/led', { ext: false });
  });

  it('setAuto envoie le patch tel quel', async () => {
    const f = stub(json(makeState()));
    await setAuto({ actif: true, seuil_marche: 30 });
    check(f, '/api/auto', { actif: true, seuil_marche: 30 });
  });

  it('setCamera envoie num et on', async () => {
    const f = stub(json(makeState()));
    await setCamera(1, true);
    check(f, '/api/camera', { num: 1, on: true });
  });

  it('renvoie le nouvel état du serveur', async () => {
    const s = makeState({ cam2: true });
    stub(json(s));
    expect(await setCamera(1, true)).toEqual(s);
  });

  it('rejette sur JSON invalide ou réseau tombé', async () => {
    stub(new Response('pas du json', { status: 400 }));
    await expect(setFan(50)).rejects.toThrow();
    stub(async () => { throw new TypeError('réseau'); });
    await expect(setAuto({})).rejects.toThrow('réseau');
  });
});
