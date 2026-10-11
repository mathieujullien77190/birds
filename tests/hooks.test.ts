// @vitest-environment jsdom
// Hooks React (état persistant, historique « Retour », plan de coupe, raccourcis clavier, liens vue 3D ↔ simulateur) et petits utilitaires du DOM.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRef, useState } from 'react';
import { usePersistentFlag, usePersistentState, useEscapeKey } from '@/hooks';
import { randomId, saveSvg, saveText } from '@/lib';
import { useCutPlane } from '@/features/viewer/hooks/useCutPlane';
import { useDayNight } from '@/features/viewer/hooks/useDayNight';
import { useDrawer } from '@/features/viewer/hooks/useDrawer';
import { useFanSpeed } from '@/features/viewer/hooks/useFanSpeed';
import { useHiddenPlanks } from '@/features/viewer/hooks/useHiddenPlanks';
import { useHistory } from '@/features/viewer/hooks/useHistory';
import { useIrBeams } from '@/features/viewer/hooks/useIrBeams';
import { useKeyboardShortcuts } from '@/features/viewer/hooks/useKeyboardShortcuts';
import { useNestParams } from '@/features/viewer/hooks/useNestParams';
import { usePiCameraShot } from '@/features/viewer/hooks/usePiCameraShot';
import { STORAGE } from '@/features/viewer/constants';
import { NEST_DEFAULT, type Plank, type PlankScene } from '@/birdhouse/model';
import type { View } from '@/birdhouse/three/types';

const plank = (id: string, over: Partial<Plank> = {}): Plank => ({ id, name: id, w: 100, h: 50, pos: [0, 0, 0], rot: [0, 0, 0], notches: [], holes: [], ...over });
const scene = (planks: Plank[] = [], t = 3): PlankScene => ({ t, fit: 0, planks, up: 'z2' });
const asView = (v: unknown) => ({ current: v as View });

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('usePersistentState', () => {
  it('lit la valeur enregistrée, écrit à chaque changement (JSON par défaut)', () => {
    localStorage.setItem('k', '5');
    const { result } = renderHook(() => usePersistentState<number>('k', (raw) => (raw === null ? 0 : Number(raw))));
    expect(result.current[0]).toBe(5);
    act(() => result.current[1](9));
    expect(localStorage.getItem('k')).toBe('9');
  });
  it('sans valeur enregistrée : parse reçoit null ; serialize personnalisé', () => {
    const parse = vi.fn((raw: string | null) => raw ?? 'défaut');
    const { result } = renderHook(() => usePersistentState('k2', parse, (v: string) => `<${v}>`));
    expect(parse).toHaveBeenCalledWith(null);
    expect(result.current[0]).toBe('défaut');
    expect(localStorage.getItem('k2')).toBe('<défaut>');
  });
  it('un stockage qui refuse la lecture ou l\'écriture ne casse rien', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('refusé'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const { result } = renderHook(() => usePersistentState('k3', (raw) => raw ?? 'ok'));
    expect(result.current[0]).toBe('ok');
    act(() => result.current[1]('autre'));
    expect(result.current[0]).toBe('autre');
  });
});

describe('usePersistentFlag', () => {
  it('vrai par défaut (ou la valeur initiale donnée), faux seulement si la clé vaut « 0 »', () => {
    expect(renderHook(() => usePersistentFlag('a')).result.current[0]).toBe(true);
    expect(renderHook(() => usePersistentFlag('b', false)).result.current[0]).toBe(false);
    localStorage.setItem('c', '0');
    expect(renderHook(() => usePersistentFlag('c')).result.current[0]).toBe(false);
    localStorage.setItem('d', '1');
    expect(renderHook(() => usePersistentFlag('d', false)).result.current[0]).toBe(true);
  });
  it('écrit « 1 » / « 0 » à chaque changement', () => {
    const { result } = renderHook(() => usePersistentFlag('e'));
    expect(localStorage.getItem('e')).toBe('1');
    act(() => result.current[1](false));
    expect(localStorage.getItem('e')).toBe('0');
    act(() => result.current[1]((o) => !o));
    expect(localStorage.getItem('e')).toBe('1');
  });
  it('un stockage cassé : valeur initiale, pas d\'exception', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('x'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('x'); });
    const { result } = renderHook(() => usePersistentFlag('f', false));
    expect(result.current[0]).toBe(false);
  });
});

describe('useEscapeKey', () => {
  it('appelle le dernier gestionnaire sur Échap seulement, et se désinscrit au démontage', () => {
    const a = vi.fn(), b = vi.fn();
    const { rerender, unmount } = renderHook(({ h }) => useEscapeKey(h), { initialProps: { h: a } });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(a).not.toHaveBeenCalled();
    rerender({ h: b });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    unmount();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(b).toHaveBeenCalledTimes(1);
  });
});

describe('lib : identifiants et téléchargements', () => {
  it('randomId : court, alphanumérique, différent à chaque appel', () => {
    const ids = new Set(Array.from({ length: 50 }, randomId));
    expect(ids.size).toBe(50);
    for (const i of ids) expect(i).toMatch(/^[a-z0-9]{1,7}$/);
  });
  it('saveSvg et saveText créent un lien de téléchargement nommé, le cliquent puis libèrent l\'adresse', () => {
    const urls: Blob[] = [];
    (URL as unknown as Record<string, unknown>).createObjectURL = (b: Blob) => { urls.push(b); return 'blob:x'; };
    const revoke = vi.fn();
    (URL as unknown as Record<string, unknown>).revokeObjectURL = revoke;
    const clicked: { href: string; download: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicked.push({ href: this.href, download: this.download }); });
    saveSvg('<svg/>', 'planche.svg');
    saveText('G21', 'planche.gcode');
    expect(clicked).toEqual([{ href: 'blob:x', download: 'planche.svg' }, { href: 'blob:x', download: 'planche.gcode' }]);
    expect(urls.map((b) => b.type)).toEqual(['image/svg+xml', 'text/plain']);
    expect(revoke).toHaveBeenCalledTimes(2);
  });
});

describe('useCutPlane', () => {
  it('départ : plan éteint ; l\'axe et le côté sont gardés (pas l\'état « allumé » ni la position)', () => {
    localStorage.setItem(STORAGE.cut, JSON.stringify({ axis: 'x', flip: true }));
    const scRef = { current: scene() };
    const { result } = renderHook(() => useCutPlane(scRef));
    expect(result.current.cut).toEqual({ on: false, axis: 'x', pos: 0, flip: true });
    act(() => result.current.setCut({ on: true, axis: 'z', pos: 12, flip: false }));
    expect(JSON.parse(localStorage.getItem(STORAGE.cut)!)).toEqual({ axis: 'z', flip: false });
    expect(result.current.cutRef.current.axis).toBe('z');
  });
  it('texte enregistré invalide : valeurs par défaut', () => {
    localStorage.setItem(STORAGE.cut, '{pas du json');
    const { result } = renderHook(() => useCutPlane({ current: scene() }));
    expect(result.current.cut).toEqual({ on: false, axis: 'y', pos: 0, flip: false });
    localStorage.setItem(STORAGE.cut, '{}');
    expect(renderHook(() => useCutPlane({ current: scene() })).result.current.cut.axis).toBe('y');
  });
  it('midOf : milieu de la boîte englobante le long de l\'axe, arrondi ; 0 si la scène est vide', () => {
    const scRef = { current: scene() };
    const { result } = renderHook(() => useCutPlane(scRef));
    expect(result.current.midOf('x')).toBe(0);
    scRef.current = scene([plank('a', { pos: [100, 0, 0], w: 50, h: 20 })]);
    expect(result.current.midOf('x')).toBe(100);
    expect(result.current.midOf('y')).toBe(0);
  });
});

describe('useDrawer', () => {
  it('« pieces » par défaut ; fermer = texte vide enregistré, relu comme « fermé »', () => {
    const { result, unmount } = renderHook(() => useDrawer());
    expect(result.current[0]).toBe('pieces');
    act(() => result.current[1](null));
    expect(localStorage.getItem(STORAGE.drawer)).toBe('');
    unmount();
    expect(renderHook(() => useDrawer()).result.current[0]).toBeFalsy(); // volet fermé : le texte vide est relu tel quel, aucun volet ne s'ouvre
    localStorage.setItem(STORAGE.drawer, 'history');
    expect(renderHook(() => useDrawer()).result.current[0]).toBe('history');
  });
});

describe('useHiddenPlanks', () => {
  it('toggleHidden : cache tout, puis montre tout si tout est déjà caché ; mémorisé', () => {
    const { result } = renderHook(() => useHiddenPlanks());
    expect([...result.current.hidden]).toEqual([]);
    act(() => result.current.toggleHidden(['a', 'b']));
    expect([...result.current.hidden].sort()).toEqual(['a', 'b']);
    expect(JSON.parse(localStorage.getItem(STORAGE.hidden)!).sort()).toEqual(['a', 'b']);
    act(() => result.current.toggleHidden(['a', 'c'])); // pas tous cachés : on cache tout
    expect([...result.current.hidden].sort()).toEqual(['a', 'b', 'c']);
    act(() => result.current.toggleHidden(['a', 'c'])); // tous cachés : on les montre
    expect([...result.current.hidden]).toEqual(['b']);
  });
  it('lit les pièces cachées enregistrées ; texte invalide = rien de caché', () => {
    localStorage.setItem(STORAGE.hidden, '["x"]');
    expect([...renderHook(() => useHiddenPlanks()).result.current.hidden]).toEqual(['x']);
    localStorage.setItem(STORAGE.hidden, 'zzz');
    expect(renderHook(() => useHiddenPlanks()).result.current.hidden.size).toBe(0);
  });
});

describe('useNestParams', () => {
  it('défauts, réglages enregistrés par-dessus, texte invalide = défauts', () => {
    expect(renderHook(() => useNestParams()).result.current[0]).toEqual(NEST_DEFAULT);
    localStorage.setItem(STORAGE.nest, JSON.stringify({ hole: 32 }));
    expect(renderHook(() => useNestParams()).result.current[0]).toEqual({ ...NEST_DEFAULT, hole: 32 });
    localStorage.setItem(STORAGE.nest, '{oups');
    expect(renderHook(() => useNestParams()).result.current[0]).toEqual(NEST_DEFAULT);
  });
});

describe('useHistory : « Retour »', () => {
  /** Monte le hook avec une vraie scène réactive (la réf suit l'état, comme dans Planks.tsx). */
  function setup(onUndo = vi.fn()) {
    return renderHook(() => {
      const [sc, setSc] = useState(scene());
      const scRef = useRef(sc);
      scRef.current = sc;
      const h = useHistory(scRef, setSc, onUndo);
      return { ...h, sc, scRef };
    });
  }
  const add = (id: string) => (s: PlankScene) => ({ ...s, planks: [...s.planks, plank(id)] });

  it('commit garde l\'état d\'avant ; undoTo le restaure et appelle onUndo', () => {
    const onUndo = vi.fn();
    const { result } = setup(onUndo);
    expect(result.current.backLabel).toBeNull();
    act(() => result.current.commit('Ajout a', add('a')));
    expect(result.current.sc.planks.map((p) => p.id)).toEqual(['a']);
    expect(result.current.backLabel).toBe('Ajout a');
    expect(result.current.history.current).toHaveLength(1);
    expect(result.current.history.current[0].scene.planks).toHaveLength(0);
    act(() => result.current.back());
    expect(result.current.sc.planks).toHaveLength(0);
    expect(onUndo).toHaveBeenCalledWith(expect.objectContaining({ planks: [] }));
    expect(result.current.backLabel).toBeNull();
  });
  it('même libellé en moins d\'une seconde : une seule entrée ; après un délai, deux ; `merge` fond toujours', () => {
    vi.useFakeTimers();
    try {
      const { result } = setup();
      act(() => result.current.commit('Réglage', add('a')));
      vi.setSystemTime(Date.now() + 500);
      act(() => result.current.commit('Réglage', add('b')));
      expect(result.current.history.current).toHaveLength(1);
      vi.setSystemTime(Date.now() + 5000);
      act(() => result.current.commit('Réglage', add('c')));
      expect(result.current.history.current).toHaveLength(2);
      vi.setSystemTime(Date.now() + 5000);
      act(() => result.current.commit('Réglage', add('d'), true));
      expect(result.current.history.current).toHaveLength(2);
      act(() => result.current.commit('Autre', add('e')));
      expect(result.current.history.current.map((e) => e.label)).toEqual(['Réglage', 'Réglage', 'Autre']);
    } finally { vi.useRealTimers(); }
  });
  it('undoTo(i) annule l\'action i et les suivantes ; index inconnu : rien ; backLabel redevient celui de l\'avant-dernière', () => {
    const { result } = setup();
    act(() => result.current.commit('A', add('a')));
    act(() => result.current.commit('B', add('b')));
    act(() => result.current.commit('C', add('c')));
    act(() => result.current.undoTo(99));
    expect(result.current.sc.planks).toHaveLength(3);
    act(() => result.current.undoTo(1));
    expect(result.current.sc.planks.map((p) => p.id)).toEqual(['a']);
    expect(result.current.history.current.map((e) => e.label)).toEqual(['A']);
    expect(result.current.backLabel).toBe('A');
  });
  it('pushEntry garde l\'état courant sans le changer ; clearHistory vide aussi le stockage', () => {
    const { result } = setup();
    act(() => result.current.commit('A', add('a')));
    act(() => result.current.pushEntry('Glissé'));
    expect(result.current.backLabel).toBe('Glissé');
    expect(result.current.history.current[1].scene.planks.map((p) => p.id)).toEqual(['a']);
    expect(result.current.sc.planks).toHaveLength(1);
    act(() => result.current.clearHistory());
    expect(result.current.history.current).toEqual([]);
    expect(result.current.backLabel).toBeNull();
    expect(localStorage.getItem('plaques-historique')).toBe('[]');
  });
  it('recharge l\'historique enregistré : le dernier libellé est proposé pour « Retour »', () => {
    localStorage.setItem('plaques-historique', JSON.stringify([{ label: 'Ancien', scene: scene(), at: 1 }]));
    const { result } = setup();
    expect(result.current.backLabel).toBe('Ancien');
    expect(result.current.history.current).toHaveLength(1);
  });
});

describe('useKeyboardShortcuts', () => {
  function mount() {
    const back = vi.fn(), commit = vi.fn(), clearSelection = vi.fn(), escape = vi.fn();
    const refs = { back: { current: back }, commit: { current: commit }, selectedId: { current: 'p1' as string | null }, groupSel: { current: null as string | null } };
    const r = renderHook(() => useKeyboardShortcuts(refs, { clearSelection, escape }));
    return { back, commit, clearSelection, escape, refs, ...r };
  }
  const key = (init: KeyboardEventInit, target: EventTarget = window) => target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));

  it('Ctrl+Z (ou Cmd+Z) = Retour, sauf dans un champ de texte', () => {
    const m = mount();
    key({ key: 'z', ctrlKey: true });
    key({ key: 'Z', metaKey: true });
    expect(m.back).toHaveBeenCalledTimes(2);
    const input = document.createElement('input'); document.body.appendChild(input);
    key({ key: 'z', ctrlKey: true }, input);
    expect(m.back).toHaveBeenCalledTimes(2);
    key({ key: 'z' });
    expect(m.back).toHaveBeenCalledTimes(2);
    input.remove();
  });
  it('Suppr supprime la plaque choisie ; avec une boîte choisie, toute la boîte', () => {
    const m = mount();
    key({ key: 'Delete' });
    expect(m.commit).toHaveBeenCalledWith('Plaque supprimée', expect.any(Function));
    const next = m.commit.mock.calls[0][1] as (s: PlankScene) => PlankScene;
    expect(next(scene([plank('p1'), plank('p2')])).planks.map((p) => p.id)).toEqual(['p2']);
    expect(m.clearSelection).toHaveBeenCalledTimes(1);
    m.refs.groupSel.current = 'g';
    key({ key: 'Backspace' });
    expect(m.commit).toHaveBeenLastCalledWith('Boîte supprimée', expect.any(Function));
    const nextG = m.commit.mock.calls[1][1] as (s: PlankScene) => PlankScene;
    expect(nextG(scene([plank('a', { group: 'g' }), plank('b', { group: 'h' })])).planks.map((p) => p.id)).toEqual(['b']);
  });
  it('rien à supprimer sans sélection ; dans un champ de texte, Suppr et Retour arrière ne suppriment rien', () => {
    const m = mount();
    m.refs.selectedId.current = null;
    key({ key: 'Delete' });
    expect(m.commit).not.toHaveBeenCalled();
    m.refs.selectedId.current = 'p1';
    const ta = document.createElement('textarea'); document.body.appendChild(ta);
    key({ key: 'Delete' }, ta); key({ key: 'Backspace' }, ta);
    expect(m.commit).not.toHaveBeenCalled();
    ta.remove();
  });
  it('Échap appelle escape ; désinscription au démontage', () => {
    const m = mount();
    key({ key: 'Escape' });
    expect(m.escape).toHaveBeenCalledTimes(1);
    m.unmount();
    key({ key: 'Escape' });
    expect(m.escape).toHaveBeenCalledTimes(1);
  });
});

describe('liens vue 3D ↔ simulateur du Pi', () => {
  it('useDayNight : règle la nuit des faisceaux infrarouges ; sans vue, ne fait rien', () => {
    const setNight = vi.fn();
    const { rerender } = renderHook(({ n }) => useDayNight(asView({ ir: { setNight } }), n), { initialProps: { n: false } });
    expect(setNight).toHaveBeenLastCalledWith(false);
    rerender({ n: true });
    expect(setNight).toHaveBeenLastCalledWith(true);
    expect(() => renderHook(() => useDayNight({ current: null }, true))).not.toThrow();
  });
  it('useFanSpeed : donne le pourcentage à la vue ; sans vue, ne fait rien', () => {
    const view = { fan: { pct: 0, angle: 0 } };
    const { rerender } = renderHook(({ p }) => useFanSpeed(asView(view), p), { initialProps: { p: 40 } });
    expect(view.fan.pct).toBe(40);
    rerender({ p: 0 });
    expect(view.fan.pct).toBe(0);
    expect(() => renderHook(() => useFanSpeed({ current: null }, 5))).not.toThrow();
  });
  it('useIrBeams : lie les cartes par leur nom (null si absentes) et allume les faisceaux selon `leds`', () => {
    const bind = vi.fn(), set = vi.fn();
    const meshA = { id: 'mesh-nid' }, meshB = { id: 'mesh-ext' };
    const view = { ir: { bind, set }, meshes: new Map<string, unknown>([['a', meshA], ['b', meshB]]) };
    const sc = scene([plank('a', { name: 'LED infrarouges' }), plank('b', { name: 'LED infrarouges extérieures' })]);
    const { rerender } = renderHook(({ l }) => useIrBeams(asView(view), sc, l), { initialProps: { l: { nid: true, ext: false } } });
    expect(bind).toHaveBeenCalledWith('nid', meshA);
    expect(bind).toHaveBeenCalledWith('ext', meshB);
    expect(set).toHaveBeenCalledWith('nid', true);
    expect(set).toHaveBeenCalledWith('ext', false);
    rerender({ l: { nid: false, ext: true } });
    expect(set).toHaveBeenLastCalledWith('ext', true);
    bind.mockClear();
    renderHook(() => useIrBeams(asView(view), scene([plank('z', { name: 'LED infrarouges' })]), { nid: false, ext: false }));
    expect(bind).toHaveBeenCalledWith('nid', null); // carte présente mais sans mesh
    expect(bind).toHaveBeenCalledWith('ext', null); // carte absente
    expect(() => renderHook(() => useIrBeams({ current: null }, sc, { nid: true, ext: true }))).not.toThrow();
  });
  it('usePiCameraShot : prise de vue depuis la bonne carte, bons paramètres (IR, nuit, champ, horizon) ; null sans carte ni vue', () => {
    const shoot = vi.fn(() => 'data:image/jpeg;base64,xx');
    const m1 = { n: 1 }, m2 = { n: 2 };
    const view = { shooter: { shoot }, meshes: new Map<string, unknown>([['c1', m1], ['c2', m2]]) };
    const scRef = { current: scene([plank('c1', { name: 'Caméra', special: 'camera' }), plank('c2', { name: 'Caméra 2', special: 'camera' })]) };
    const { result, rerender } = renderHook(({ night }) => usePiCameraShot(asView(view), scRef, night), { initialProps: { night: false } });
    expect(result.current(0)).toBe('data:image/jpeg;base64,xx');
    expect(shoot).toHaveBeenLastCalledWith(m1, 'CAM1 (nid)', { gray: false, ir: false, night: false, fov: 80, level: false });
    result.current(0, true);
    expect(shoot).toHaveBeenLastCalledWith(m1, 'CAM1 (nid, IR)', { gray: true, ir: true, night: false, fov: 80, level: false });
    result.current(1);
    expect(shoot).toHaveBeenLastCalledWith(m2, 'CAM2 (entrée)', { gray: false, ir: false, night: false, fov: 66, level: true });
    result.current(1, true);
    expect(shoot).toHaveBeenLastCalledWith(m2, 'CAM2 (entrée, IR)', { gray: true, ir: true, night: false, fov: 66, level: true });
    const first = result.current;
    rerender({ night: true }); // la première fonction rendue lit l'état courant par la réf
    first(0);
    expect(shoot).toHaveBeenLastCalledWith(m1, 'CAM1 (nid)', expect.objectContaining({ night: true }));
    scRef.current = scene(); // plus de carte : null
    expect(result.current(1)).toBeNull();
    expect(renderHook(() => usePiCameraShot({ current: null }, { current: scene([plank('c1', { name: 'Caméra', special: 'camera' })]) }, false)).result.current(0)).toBeNull();
  });
});
