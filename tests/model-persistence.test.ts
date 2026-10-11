import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SCENE, forgetHistory, loadScene, saveScene, type Plank, type PlankScene } from '@/birdhouse/model';

/** localStorage factice en mémoire ; `limit` = taille maximale d'une valeur (au-delà : QuotaExceededError). */
function fakeStorage(limit = Infinity) {
  const data = new Map<string, string>();
  const calls: { key: string; length: number }[] = [];
  const api = {
    getItem: (k: string): string | null => data.get(k) ?? null,
    setItem: (k: string, v: string): void => {
      calls.push({ key: k, length: v.length });
      if (v.length > limit) throw new DOMException('quota', 'QuotaExceededError');
      data.set(k, v);
    },
    removeItem: (k: string): void => { data.delete(k); },
    clear: (): void => data.clear(),
  };
  return { api, data, calls };
}

const plank = (id: string, over: Partial<Plank> = {}): Plank => ({ id, name: id, w: 10, h: 10, pos: [1, 2, 3], rot: [0, 0, 0], notches: [], holes: [], ...over });
const scene = (planks: Plank[], over: Partial<PlankScene> = {}): PlankScene => ({ t: 3, fit: 0, planks, up: 'z2', ...over });

let store: ReturnType<typeof fakeStorage>;
beforeEach(() => { store = fakeStorage(); vi.stubGlobal('localStorage', store.api); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('loadScene / saveScene', () => {
  it('rien d\'enregistré → scène par défaut', () => {
    expect(loadScene()).toBe(DEFAULT_SCENE);
  });
  it('JSON illisible → scène par défaut', () => {
    store.data.set('plaques-scene', '{pas du json');
    expect(loadScene()).toBe(DEFAULT_SCENE);
  });
  it('JSON sans liste de plaques → scène par défaut', () => {
    store.data.set('plaques-scene', JSON.stringify({ t: 3, planks: 'non' }));
    expect(loadScene()).toBe(DEFAULT_SCENE);
    store.data.set('plaques-scene', 'null');
    expect(loadScene()).toBe(DEFAULT_SCENE);
  });
  it('aller-retour : la scène enregistrée est relue à l\'identique', () => {
    const s = scene([plank('a', { notches: [{ id: 'n', edge: 'top', pos: 1, width: 2, depth: 3 }], group: 'g' })], { groupNames: { g: 'Boîte' } });
    saveScene(s);
    expect(store.calls).toHaveLength(1);
    expect(store.calls[0].key).toBe('plaques-scene');
    expect(loadScene()).toEqual(s);
  });
  it('jeu forcé à 0, crans et trous absents remplacés par des listes vides', () => {
    store.data.set('plaques-scene', JSON.stringify({ t: 4, fit: 0.7, up: 'z2', planks: [{ id: 'a', name: 'a', w: 1, h: 1, pos: [0, 0, 0], rot: [0, 0, 0] }] }));
    const s = loadScene();
    expect(s.fit).toBe(0);
    expect(s.t).toBe(4);
    expect(s.planks[0].notches).toEqual([]);
    expect(s.planks[0].holes).toEqual([]);
  });
  it('ancienne scène (sans up) convertie en Z = hauteur au chargement', () => {
    store.data.set('plaques-scene', JSON.stringify({ t: 3, fit: 0, planks: [plank('a', { pos: [1, 2, 3] })] }));
    const s = loadScene();
    expect(s.up).toBe('z2');
    expect(s.planks[0].pos).toEqual([1, -3, 2]);
  });
  it('saveScene : quota dépassé → silencieux, rien d\'enregistré', () => {
    store = fakeStorage(10);
    vi.stubGlobal('localStorage', store.api);
    expect(() => saveScene(scene([plank('a')]))).not.toThrow();
    expect(store.data.has('plaques-scene')).toBe(false);
    expect(store.calls).toHaveLength(1);
  });
});

describe('forgetHistory', () => {
  it('efface l\'ancien historique enregistré, sans toucher à la scène', () => {
    store.data.set('plaques-historique', '[1]');
    store.data.set('plaques-scene', '{}');
    forgetHistory();
    expect(store.data.has('plaques-historique')).toBe(false);
    expect(store.data.has('plaques-scene')).toBe(true);
  });
  it('un stockage qui refuse : ne plante pas', () => {
    vi.stubGlobal('localStorage', { removeItem: () => { throw new Error('refusé'); } });
    expect(() => forgetHistory()).not.toThrow();
  });
});
