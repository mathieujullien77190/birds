// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import type { AssemblyStep } from '@/birdhouse/model';
import { AssemblyPanel, clampIndex, hiddenFor, indexOfStored, keyAction, parseText, progressOf, swipeDirection, viewOf } from '@/features/viewer/components/AssemblyPanel';
import { useAssembly } from '@/features/viewer/hooks/useAssembly';
import { useWakeLock } from '@/hooks';
import { STORAGE } from '@/features/viewer/constants';
import { ViewToolbar } from '@/features/viewer/components/ViewToolbar';
import { ViewModeToggle } from '@/features/viewer/components/ViewModeToggle';
import { MobileBar } from '@/features/viewer/components/MobileBar';
import { buildNest } from './helpers';

const st = (id: string, block: string, pieceIds: string[], over: Partial<AssemblyStep> = {}): AssemblyStep => ({ id, title: `Titre ${id}`, kind: 'placer', block, pieceIds, ...over });
const steps: AssemblyStep[] = [
  st('a', 'aeration', ['p1']),
  st('b', 'aeration', ['p2'], { text: 'Une consigne\n- puce 1\n- puce 2\nFin' }),
  st('c', 'corps', ['p3'], { focusIds: ['p9'], kind: 'coller' }),
  st('d', 'corps', ['p4'], { hideIds: ['p1'] }),
];

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('helpers du panneau de montage', () => {
  it('parseText : paragraphes et puces', () => {
    expect(parseText(undefined)).toEqual([]);
    expect(parseText('A\n\n- x\n- y\nB')).toEqual([{ type: 'p', text: 'A' }, { type: 'ul', items: ['x', 'y'] }, { type: 'p', text: 'B' }]);
  });
  it('clampIndex, progressOf, indexOfStored', () => {
    expect(clampIndex(5, 4)).toBe(3); expect(clampIndex(-2, 4)).toBe(0); expect(clampIndex(NaN, 4)).toBe(0); expect(clampIndex(2, 0)).toBe(0); expect(clampIndex(1.7, 4)).toBe(1);
    expect(progressOf(11, 140)).toEqual({ label: '12 / 140', percent: 9 });
    expect(progressOf(0, 0)).toEqual({ label: '0 / 0', percent: 0 });
    expect(indexOfStored('c', steps)).toBe(2); expect(indexOfStored('zzz', steps)).toBe(0); expect(indexOfStored(null, steps)).toBe(0); expect(indexOfStored('', steps)).toBe(0);
  });
  it('viewOf : étapes faites + étape courante, pièces cachées, surbrillance', () => {
    const v = viewOf(steps, 2);
    expect([...v.visible].sort()).toEqual(['p1', 'p2', 'p3', 'p9']);
    expect([...v.highlight].sort()).toEqual(['p3', 'p9']);
    expect([...viewOf(steps, 3).visible].sort()).toEqual(['p2', 'p3', 'p4']); // p1 caché par l'étape
    expect(viewOf(steps, 99).highlight.has('p4')).toBe(true); // indice hors bornes ramené à la dernière étape
    expect(viewOf([], 0)).toEqual({ visible: new Set(), highlight: new Set() });
    expect([...hiddenFor(['p1', 'p2', 'x'], new Set(['p1']))]).toEqual(['p2', 'x']);
  });
  it('swipeDirection : seulement un balayage horizontal assez long', () => {
    expect(swipeDirection(-80, 5)).toBe(1); expect(swipeDirection(80, -5)).toBe(-1);
    expect(swipeDirection(20, 0)).toBe(0); expect(swipeDirection(-60, 80)).toBe(0); expect(swipeDirection(30, 0, 20)).toBe(-1);
  });
  it('keyAction : flèches et Échap, rien en tapant dans un champ (sauf Échap)', () => {
    expect(keyAction('ArrowRight', false)).toBe('next'); expect(keyAction('ArrowLeft', false)).toBe('prev'); expect(keyAction('Escape', false)).toBe('close');
    expect(keyAction('Escape', true)).toBe('close'); expect(keyAction('ArrowRight', true)).toBeNull(); expect(keyAction('a', false)).toBeNull();
  });
});

describe('AssemblyPanel', () => {
  const setup = (mobile: boolean, start = 0) => {
    const setIndex = vi.fn(), onClose = vi.fn();
    const r = render(<AssemblyPanel steps={steps} index={start} setIndex={setIndex} onClose={onClose} mobile={mobile} />);
    return { setIndex, onClose, ...r };
  };
  it('sur ordinateur, la feuille de montage est AU-DESSUS de la bascule 3D / Planches (bottom-14) ; sur téléphone, en bas pleine largeur', () => {
    const { container, unmount } = setup(false, 1); const desk = container.firstElementChild as HTMLElement;
    expect(desk.className).toContain('bottom-14'); expect(desk.className).not.toContain('bottom-3'); unmount();
    const m = setup(true, 1); expect((m.container.firstElementChild as HTMLElement).className).toContain('bottom-0');
  });
  it('affiche le titre, la nature, la progression, la consigne en paragraphes et puces', () => {
    setup(true, 1);
    expect(screen.getByText('Titre b')).toBeTruthy();
    expect(screen.getByText('Placer')).toBeTruthy();
    expect(screen.getByText('Étape 2 / 4')).toBeTruthy();
    expect(screen.getByText('Une consigne')).toBeTruthy();
    expect(screen.getAllByRole('listitem').map((l) => l.textContent)).toEqual(['puce 1', 'puce 2']);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50');
  });
  it('Précédent / Suivant : grands boutons, désactivés aux bornes', () => {
    const { setIndex, rerender, onClose } = setup(true, 0);
    const prev = screen.getByText('◀ Précédent') as HTMLButtonElement, next = screen.getByText('Suivant ▶') as HTMLButtonElement;
    expect(prev.disabled).toBe(true); expect(next.disabled).toBe(false);
    expect(prev.className).toContain('h-12'); // 48 px : à portée du pouce
    fireEvent.click(next); expect(setIndex).toHaveBeenCalledWith(1);
    rerender(<AssemblyPanel steps={steps} index={3} setIndex={setIndex} onClose={onClose} mobile />);
    expect((screen.getByText('Suivant ▶') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText('◀ Précédent')); expect(setIndex).toHaveBeenLastCalledWith(2);
  });
  it('saut rapide par bloc', () => {
    const { setIndex } = setup(false, 0);
    const sel = screen.getByLabelText('Aller à un bloc') as HTMLSelectElement;
    expect([...sel.options].map((o) => o.value)).toEqual(['aeration', 'corps']);
    fireEvent.change(sel, { target: { value: 'corps' } });
    expect(setIndex).toHaveBeenCalledWith(2);
    fireEvent.change(sel, { target: { value: 'inconnu' } });
    expect(setIndex).toHaveBeenCalledTimes(1);
  });
  it('balayage horizontal (touch) : gauche = suivant, droite = précédent, vertical ou court = rien', () => {
    const { setIndex } = setup(true, 1);
    const sheet = screen.getByLabelText('Montage pas à pas');
    const swipe = (x0: number, y0: number, x1: number, y1: number) => { fireEvent.touchStart(sheet, { touches: [{ clientX: x0, clientY: y0 }] }); fireEvent.touchEnd(sheet, { changedTouches: [{ clientX: x1, clientY: y1 }] }); };
    swipe(300, 100, 100, 110); expect(setIndex).toHaveBeenLastCalledWith(2);
    swipe(100, 100, 300, 90); expect(setIndex).toHaveBeenLastCalledWith(0);
    setIndex.mockClear();
    swipe(100, 100, 130, 100); swipe(100, 100, 120, 300);
    fireEvent.touchEnd(sheet, { changedTouches: [{ clientX: 0, clientY: 0 }] }); // fin sans début
    fireEvent.touchStart(sheet, { touches: [] }); fireEvent.touchEnd(sheet, { changedTouches: [] });
    expect(setIndex).not.toHaveBeenCalled();
    expect(sheet.style.touchAction).toBe('pan-y');
  });
  it('mobile : feuille d\'au plus 40 % de la hauteur, texte 16 px ; bureau : fiche flottante', () => {
    const m = setup(true, 0);
    expect(screen.getByLabelText('Montage pas à pas').className).toContain('max-h-[40%]');
    expect(screen.getByLabelText('Montage pas à pas').innerHTML).toContain('text-base');
    m.unmount();
    setup(false, 0);
    expect(screen.getByLabelText('Montage pas à pas').className).toContain('w-[26rem]');
  });
  it('se replie en une barre fine (titre + « 12 / 140 ») et se rouvre au toucher', () => {
    setup(true, 2);
    fireEvent.click(screen.getByLabelText('Replier le montage'));
    expect(screen.queryByLabelText('Montage pas à pas')).toBeNull();
    const bar = screen.getByLabelText('Rouvrir le montage');
    expect(bar.textContent).toContain('Titre c'); expect(bar.textContent).toContain('3 / 4');
    fireEvent.click(bar);
    expect(screen.getByLabelText('Montage pas à pas')).toBeTruthy();
  });
  it('replié sur le bureau : barre au même endroit ; × quitte ; sans étape rien n\'est affiché', () => {
    const { onClose, unmount } = setup(false, 0);
    fireEvent.click(screen.getByLabelText('Replier le montage'));
    expect(screen.getByLabelText('Rouvrir le montage').className).toContain('w-[26rem]');
    fireEvent.click(screen.getByLabelText('Rouvrir le montage'));
    fireEvent.click(screen.getByLabelText('Quitter le montage'));
    expect(onClose).toHaveBeenCalled();
    unmount();
    const empty = render(<AssemblyPanel steps={[]} index={0} setIndex={() => undefined} onClose={() => undefined} mobile />);
    expect(empty.container.innerHTML).toBe('');
  });
});

describe('boutons « Montage »', () => {
  const w = { cassette: 'summer', plug: 'open' } as never;
  it('ViewToolbar : le bouton bascule le mode', () => {
    const f = vi.fn();
    render(<ViewToolbar assemblyOn={false} onToggleAssembly={f} winter={w} onToggleCassette={() => undefined} onTogglePlug={() => undefined} schemaOn={false} onToggleSchema={() => undefined} meterOn={false} onToggleMeter={() => undefined} onOpenPi={() => undefined} cutOn={false} onToggleCut={() => undefined} />);
    fireEvent.click(screen.getByText('Montage')); expect(f).toHaveBeenCalled();
  });
  it('ViewToolbar : le bouton « Dossier » est collé au bouton « Schéma »', () => {
    const f = vi.fn();
    render(<ViewToolbar assemblyOn={false} onToggleAssembly={() => undefined} winter={w} onToggleCassette={() => undefined} onTogglePlug={() => undefined} schemaOn={false} onToggleSchema={() => undefined} meterOn={false} onToggleMeter={() => undefined} onOpenPi={() => undefined} onOpenDoc={f} cutOn={false} onToggleCut={() => undefined} />);
    const b = screen.getByText('Dossier').closest('button')!, schema = screen.getByText('Schéma').closest('button')!;
    expect(b.parentElement).toBe(schema.parentElement); fireEvent.click(b); expect(f).toHaveBeenCalled();
  });
  it('ViewModeToggle : bascule 3D / Planches en bas à droite', () => {
    const f = vi.fn();
    const { rerender } = render(<ViewModeToggle sheets={false} onChange={f} />);
    expect(screen.getByText('3D').closest('button')!.getAttribute('aria-pressed')).toBe('true'); expect(screen.getByText('Planches').closest('button')!.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByText('Planches')); expect(f).toHaveBeenLastCalledWith(true);
    rerender(<ViewModeToggle sheets onChange={f} />);
    expect(screen.getByText('Planches').closest('button')!.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByText('3D')); expect(f).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('group', { name: 'Vue' }).className).toContain('bottom-3'); // toujours en bas : la feuille de montage est posée au-dessus (bottom-14)
  });
  it('MobileBar : le bouton « Montage » est dans la barre du haut', () => {
    const f = vi.fn();
    render(<MobileBar assemblyOn onToggleAssembly={f} settingsOn={false} onSettings={() => undefined} partsOn={false} onParts={() => undefined} winter={w} onToggleCassette={() => undefined} onTogglePlug={() => undefined} cutOn={false} onToggleCut={() => undefined} />);
    const b = screen.getByText('Montage').closest('button')!;
    expect(b.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(b); expect(f).toHaveBeenCalled();
  });
});

describe('useAssembly', () => {
  const sc = buildNest({});
  it('hors du mode : rien n\'est calculé, aucune vue', () => {
    const { result } = renderHook(() => useAssembly(sc));
    expect(result.current.on).toBe(false); expect(result.current.steps).toEqual([]); expect(result.current.view).toBeNull();
  });
  it('suivant / précédent / saut, bornes, mémoire de l\'étape dans localStorage, reprise après rechargement', () => {
    const a = renderHook(() => useAssembly(sc));
    act(() => a.result.current.setOn(true));
    const n = a.result.current.steps.length;
    expect(n).toBeGreaterThan(100);
    expect(a.result.current.index).toBe(0);
    act(() => a.result.current.prev()); expect(a.result.current.index).toBe(0);
    act(() => a.result.current.next()); expect(a.result.current.index).toBe(1);
    act(() => a.result.current.setIndex(n + 50)); expect(a.result.current.index).toBe(n - 1);
    act(() => a.result.current.next()); expect(a.result.current.index).toBe(n - 1);
    act(() => a.result.current.setIndex(10));
    expect(localStorage.getItem(STORAGE.assembly)).toBe(a.result.current.steps[10].id);
    expect(a.result.current.view!.highlight.size).toBeGreaterThanOrEqual(0);
    a.unmount();
    const b = renderHook(() => useAssembly(sc)); // « rechargement »
    act(() => b.result.current.setOn(true));
    expect(b.result.current.index).toBe(10);
  });
  it('setIndex sans étape ne fait rien', () => {
    const { result } = renderHook(() => useAssembly(sc));
    act(() => result.current.setIndex(3));
    expect(localStorage.getItem(STORAGE.assembly)).toBe('');
  });
  it('clavier : → suivant, ← précédent, Échap quitte ; pas de réaction en tapant dans un champ ; plus rien hors du mode', () => {
    const { result } = renderHook(() => useAssembly(sc));
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(result.current.index).toBe(0);
    act(() => result.current.setOn(true));
    fireEvent.keyDown(window, { key: 'ArrowRight' }); expect(result.current.index).toBe(1);
    fireEvent.keyDown(window, { key: 'ArrowRight' }); expect(result.current.index).toBe(2);
    fireEvent.keyDown(window, { key: 'ArrowLeft' }); expect(result.current.index).toBe(1);
    const input = document.createElement('input'); document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'ArrowRight' }); expect(result.current.index).toBe(1);
    fireEvent.keyDown(window, { key: 'x' }); expect(result.current.index).toBe(1);
    input.remove();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(result.current.on).toBe(false); expect(result.current.view).toBeNull();
  });
});

describe('useWakeLock : écran allumé pendant le montage', () => {
  const sentinel = () => ({ release: vi.fn(() => Promise.resolve()) });
  const install = (request: unknown) => Object.defineProperty(navigator, 'wakeLock', { value: request === undefined ? undefined : { request }, configurable: true });
  afterEach(() => Object.defineProperty(navigator, 'wakeLock', { value: undefined, configurable: true }));

  it('demande le verrou à l\'ouverture, le relâche à la fermeture', async () => {
    const s = sentinel(), request = vi.fn(() => Promise.resolve(s));
    install(request);
    const { rerender } = renderHook(({ on }) => useWakeLock(on), { initialProps: { on: true } });
    await act(async () => { await Promise.resolve(); });
    expect(request).toHaveBeenCalledWith('screen');
    rerender({ on: false });
    expect(s.release).toHaveBeenCalled();
  });
  it('inactif : rien n\'est demandé ; navigateur sans API : aucune erreur', () => {
    const request = vi.fn(() => Promise.resolve(sentinel()));
    install(request);
    renderHook(() => useWakeLock(false));
    expect(request).not.toHaveBeenCalled();
    install(undefined);
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
  });
  it('refus ou erreur de relâchement ignorés ; fermé avant la réponse : relâché dès qu\'elle arrive', async () => {
    install(vi.fn(() => Promise.reject(new Error('refusé'))));
    const a = renderHook(() => useWakeLock(true));
    await act(async () => { await Promise.resolve(); });
    a.unmount();
    const s = { release: vi.fn(() => Promise.reject(new Error('déjà relâché'))) };
    let resolve!: (v: typeof s) => void;
    install(vi.fn(() => new Promise<typeof s>((r) => { resolve = r; })));
    const b = renderHook(() => useWakeLock(true));
    b.unmount();
    await act(async () => { resolve(s); await Promise.resolve(); });
    expect(s.release).toHaveBeenCalled();
    const s2 = { release: vi.fn(() => Promise.reject(new Error('x'))) };
    install(vi.fn(() => Promise.resolve(s2)));
    const c = renderHook(() => useWakeLock(true));
    await act(async () => { await Promise.resolve(); });
    c.unmount();
    expect(s2.release).toHaveBeenCalled();
  });
  it('redemande le verrou quand la page redevient visible', async () => {
    const request = vi.fn(() => Promise.resolve(sentinel()));
    install(request);
    renderHook(() => useWakeLock(true));
    await act(async () => { await Promise.resolve(); });
    expect(request).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(request).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(request).toHaveBeenCalledTimes(2);
  });
});
