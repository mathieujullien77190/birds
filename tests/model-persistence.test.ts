import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SCENE, loadHistory, loadScene, saveHistory, saveScene, type HistoryEntry, type Plank, type PlankScene } from '@/birdhouse/model';

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
const entry = (label: string, at: number, planks = [plank('a')]): HistoryEntry => ({ label, at, scene: scene(planks) });

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

describe('loadHistory / saveHistory', () => {
  it('rien, JSON illisible ou pas une liste → []', () => {
    expect(loadHistory()).toEqual([]);
    store.data.set('plaques-historique', '{oups');
    expect(loadHistory()).toEqual([]);
    store.data.set('plaques-historique', JSON.stringify({ a: 1 }));
    expect(loadHistory()).toEqual([]);
  });
  it('aller-retour exact', () => {
    const h = [entry('un', 1), entry('deux', 2)];
    saveHistory(h);
    expect(store.calls.map((c) => c.key)).toEqual(['plaques-historique']);
    expect(loadHistory()).toEqual(h);
  });
  it('chaque scène de l\'historique est convertie en Z = hauteur au chargement', () => {
    const old: PlankScene = { t: 3, fit: 0, planks: [plank('a', { pos: [5, 6, 7] })] };
    store.data.set('plaques-historique', JSON.stringify([{ label: 'ancien', at: 9, scene: old }]));
    const h = loadHistory();
    expect(h[0].label).toBe('ancien');
    expect(h[0].scene.up).toBe('z2');
    expect(h[0].scene.planks[0].pos).toEqual([5, -7, 6]);
  });
  it('quota : la moitié la plus ancienne est lâchée, jusqu\'à ce que ça rentre', () => {
    const all = Array.from({ length: 8 }, (_, i) => entry(`e${i}`, i));
    const oneLen = JSON.stringify([all[0]]).length;
    store = fakeStorage(oneLen * 4 + 10); // 4 entrées passent, pas 8
    vi.stubGlobal('localStorage', store.api);
    saveHistory(all);
    expect(store.calls).toHaveLength(2); // 8 refusées, 4 acceptées
    expect(loadHistory().map((e) => e.label)).toEqual(['e4', 'e5', 'e6', 'e7']); // les plus récentes sont gardées
  });
  it('quota : nombre impair d\'entrées → on lâche ceil(n / 2) des plus anciennes', () => {
    const all = Array.from({ length: 5 }, (_, i) => entry(`e${i}`, i));
    const oneLen = JSON.stringify([all[0]]).length;
    store = fakeStorage(oneLen * 2 + 10);
    vi.stubGlobal('localStorage', store.api);
    saveHistory(all);
    expect(loadHistory().map((e) => e.label)).toEqual(['e3', 'e4']); // 5 → 2 (on ôte 3) ; 2 entrées tiennent
  });
  it('quota impossible : 6 essais au plus puis on abandonne sans lever d\'erreur', () => {
    store = fakeStorage(0);
    vi.stubGlobal('localStorage', store.api);
    const all = Array.from({ length: 100 }, (_, i) => entry(`e${i}`, i));
    expect(() => saveHistory(all)).not.toThrow();
    expect(store.calls).toHaveLength(6);
    expect(store.data.has('plaques-historique')).toBe(false);
  });
});
