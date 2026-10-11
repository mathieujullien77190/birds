import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Pas de jsdom ni de rendu React : on remplace les trois primitives de React par des doublures synchrones.
// useState rend la valeur initiale ; useEffect exécute l'effet tout de suite (et garde son nettoyage) ; useRef garde le même objet d'un « rendu » à l'autre.
const cleanups: (() => void)[] = [];
let refBox: { current: unknown } | null = null;
vi.mock('react', () => ({
  useState: (init: unknown) => [typeof init === 'function' ? (init as () => unknown)() : init, vi.fn()],
  useEffect: (fn: () => void | (() => void)) => { const c = fn(); if (c) cleanups.push(c); },
  useRef: (v: unknown) => (refBox ??= { current: v }),
}));

const { usePersistentFlag } = await import('../src/hooks/usePersistentFlag');
const { usePersistentState } = await import('../src/hooks/usePersistentState');
const { useEscapeKey } = await import('../src/hooks/useEscapeKey');

function stubStorage(initial: Record<string, string> = {}, opt: { failGet?: boolean; failSet?: boolean } = {}) {
  const store = { ...initial };
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => { if (opt.failGet) throw new Error('refusé'); return k in store ? store[k] : null; },
    setItem: (k: string, v: string) => { if (opt.failSet) throw new Error('plein'); store[k] = v; },
  });
  return store;
}

beforeEach(() => { cleanups.length = 0; refBox = null; });
afterEach(() => { vi.unstubAllGlobals(); });

describe('usePersistentState', () => {
  it('lit le texte stocké par `parse`, puis écrit la valeur en JSON', () => {
    const store = stubStorage({ k: '{"a":1}' });
    const [v] = usePersistentState('k', (raw) => JSON.parse(raw ?? '{"a":0}') as { a: number });
    expect(v).toEqual({ a: 1 });
    expect(store.k).toBe('{"a":1}');
  });
  it('clé absente : `parse` reçoit null ; la valeur de départ est écrite', () => {
    const store = stubStorage();
    const seen: (string | null)[] = [];
    const [v] = usePersistentState('k', (raw) => { seen.push(raw); return 7; });
    expect(seen).toEqual([null]);
    expect(v).toBe(7);
    expect(store.k).toBe('7');
  });
  it('sérialisation personnalisée', () => {
    const store = stubStorage();
    usePersistentState('k', () => 3, (n) => `n=${n}`);
    expect(store.k).toBe('n=3');
  });
  it('stockage qui refuse la lecture : `parse` reçoit null ; qui refuse l\'écriture : sans erreur', () => {
    stubStorage({ k: 'x' }, { failGet: true, failSet: true });
    const seen: (string | null)[] = [];
    const [v] = usePersistentState('k', (raw) => { seen.push(raw); return 'défaut'; });
    expect(seen).toEqual([null]);
    expect(v).toBe('défaut');
  });
});

describe('usePersistentFlag', () => {
  it('clé absente : vrai par défaut, ou la valeur initiale donnée', () => {
    stubStorage();
    expect(usePersistentFlag('f')[0]).toBe(true);
    stubStorage();
    expect(usePersistentFlag('f', false)[0]).toBe(false);
  });
  it('« 0 » = faux, « 1 » = vrai, autre texte = vrai (seul « 0 » éteint)', () => {
    stubStorage({ a: '0', b: '1', c: 'peut-être' });
    expect(usePersistentFlag('a')[0]).toBe(false);
    expect(usePersistentFlag('b', false)[0]).toBe(true);
    expect(usePersistentFlag('c', false)[0]).toBe(true);
  });
  it('écrit « 1 » ou « 0 »', () => {
    const store = stubStorage({ off: '0' });
    usePersistentFlag('on');
    usePersistentFlag('off');
    expect(store).toEqual({ on: '1', off: '0' });
  });
  it('stockage indisponible : valeur initiale, écriture ignorée', () => {
    stubStorage({ f: '0' }, { failGet: true, failSet: true });
    expect(usePersistentFlag('f')[0]).toBe(true);
    expect(usePersistentFlag('f', false)[0]).toBe(false);
  });
});

describe('useEscapeKey', () => {
  function stubWindow() {
    const listeners: Record<string, ((e: { key: string }) => void)[]> = {};
    vi.stubGlobal('window', {
      addEventListener: (t: string, cb: (e: { key: string }) => void) => { (listeners[t] ??= []).push(cb); },
      removeEventListener: (t: string, cb: (e: { key: string }) => void) => { listeners[t] = (listeners[t] ?? []).filter((x) => x !== cb); },
    });
    return listeners;
  }
  it('appelle le gestionnaire sur Échap seulement, et le dernier gestionnaire fourni est celui qui sert', () => {
    const listeners = stubWindow();
    const first = vi.fn(), second = vi.fn();
    useEscapeKey(first);
    expect(listeners.keydown).toHaveLength(1);
    listeners.keydown[0]({ key: 'Enter' });
    listeners.keydown[0]({ key: 'a' });
    expect(first).not.toHaveBeenCalled();
    listeners.keydown[0]({ key: 'Escape' });
    expect(first).toHaveBeenCalledTimes(1);
    useEscapeKey(second); // nouveau rendu : même référence, nouveau gestionnaire
    listeners.keydown[0]({ key: 'Escape' });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
  it('le nettoyage retire l\'écouteur', () => {
    const listeners = stubWindow();
    useEscapeKey(() => {});
    expect(listeners.keydown).toHaveLength(1);
    cleanups[0]();
    expect(listeners.keydown).toHaveLength(0);
  });
});
