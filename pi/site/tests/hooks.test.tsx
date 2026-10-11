import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/api';
import { useDeviceState } from '@/hooks';
import { PERIODE } from '@/constants';
import type { DeviceState, HistoryPoint } from '@/types';
import { makeState, point } from './fixtures';

vi.mock('@/api');
const m = vi.mocked(api);
type Hook = ReturnType<typeof useDeviceState>;

function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

beforeEach(() => {
  vi.useFakeTimers();
  m.getState.mockReset().mockResolvedValue(makeState());
  m.getHistory.mockReset().mockResolvedValue([point('10:00', 20, 15), point('10:05', 21, 15)]);
  for (const f of [m.setFan, m.setAuto, m.setLed, m.setCamera]) f.mockReset().mockResolvedValue(makeState({ t_nid: 99 }));
});
afterEach(() => { vi.useRealTimers(); });

describe('useDeviceState', () => {
  it("démarre vide puis charge l'état et l'historique", async () => {
    const { result } = renderHook(() => useDeviceState());
    expect(result.current.state).toBeNull();
    expect(result.current.history).toEqual([]);
    expect(result.current.unreachable).toBe(false);
    await flush();
    expect(result.current.state?.t_nid).toBe(24.5);
    expect(result.current.history).toHaveLength(2);
    expect(m.getState).toHaveBeenCalledTimes(1);
    expect(m.getHistory).toHaveBeenCalledTimes(1);
  });

  it('relit toutes les PERIODE ms', async () => {
    renderHook(() => useDeviceState());
    await flush();
    await tick(PERIODE - 1);
    expect(m.getState).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(m.getState).toHaveBeenCalledTimes(2);
    await tick(PERIODE);
    expect(m.getState).toHaveBeenCalledTimes(3);
    expect(m.getHistory).toHaveBeenCalledTimes(3);
  });

  it('signale « injoignable » sur erreur puis se rétablit au sondage suivant', async () => {
    m.getState.mockRejectedValueOnce(new Error('down'));
    const { result } = renderHook(() => useDeviceState());
    await flush();
    expect(result.current.unreachable).toBe(true);
    expect(result.current.state).toBeNull();
    await tick(PERIODE);
    expect(result.current.unreachable).toBe(false);
    expect(result.current.state).not.toBeNull();
  });

  it("garde le dernier état connu quand le sondage échoue", async () => {
    const { result } = renderHook(() => useDeviceState());
    await flush();
    m.getState.mockRejectedValueOnce(new Error('down'));
    await tick(PERIODE);
    expect(result.current.unreachable).toBe(true);
    expect(result.current.state?.t_nid).toBe(24.5);
  });

  it("ignore un historique en erreur ou qui n'est pas une liste", async () => {
    m.getHistory.mockRejectedValueOnce(new Error('pas de fichier'));
    const { result } = renderHook(() => useDeviceState());
    await flush();
    expect(result.current.history).toEqual([]);
    expect(result.current.state).not.toBeNull();
    m.getHistory.mockResolvedValueOnce({ erreur: 'x' } as unknown as HistoryPoint[]);
    await tick(PERIODE);
    expect(result.current.history).toEqual([]);
  });

  it('arrête le sondage au démontage', async () => {
    const { unmount } = renderHook(() => useDeviceState());
    await flush();
    unmount();
    await tick(PERIODE * 3);
    expect(m.getState).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("n'applique pas une réponse qui arrive après le démontage", async () => {
    const s = deferred<DeviceState>();
    const h = deferred<HistoryPoint[]>();
    m.getState.mockReturnValueOnce(s.promise);
    m.getHistory.mockReturnValueOnce(h.promise);
    const { result, unmount } = renderHook(() => useDeviceState());
    unmount();
    await act(async () => { s.resolve(makeState()); h.resolve([point('1', 1, 1), point('2', 2, 2)]); });
    expect(result.current.state).toBeNull();
    expect(result.current.history).toEqual([]);
  });

  it("n'applique pas une erreur qui arrive après le démontage", async () => {
    const s = deferred<DeviceState>();
    m.getState.mockReturnValueOnce(s.promise);
    const { result, unmount } = renderHook(() => useDeviceState());
    unmount();
    await act(async () => { s.reject(new Error('tard')); });
    expect(result.current.unreachable).toBe(false);
  });

  it.each<[string, (r: Hook) => Promise<void>, () => void]>([
    ['fan', (r) => r.fan(55), () => expect(m.setFan).toHaveBeenCalledWith(55)],
    ['auto', (r) => r.auto({ actif: true }), () => expect(m.setAuto).toHaveBeenCalledWith({ actif: true })],
    ['led', (r) => r.led('ext', true), () => expect(m.setLed).toHaveBeenCalledWith('ext', true)],
    ['camera', (r) => r.camera(1, true), () => expect(m.setCamera).toHaveBeenCalledWith(1, true)],
  ])("la commande %s appelle l'API et met l'état à jour", async (_n, run, assertCall) => {
    const { result } = renderHook(() => useDeviceState());
    await flush();
    await act(async () => { await run(result.current); });
    assertCall();
    expect(result.current.state?.t_nid).toBe(99);
  });

  it("une commande qui échoue rejette et laisse l'état intact", async () => {
    m.setFan.mockRejectedValueOnce(new Error('refusé'));
    const { result } = renderHook(() => useDeviceState());
    await flush();
    await act(async () => { await expect(result.current.fan(40)).rejects.toThrow('refusé'); });
    expect(result.current.state?.t_nid).toBe(24.5);
  });

  it("une commande qui répond après le démontage ne touche plus l'état", async () => {
    const d = deferred<DeviceState>();
    m.setLed.mockReturnValueOnce(d.promise);
    const { result, unmount } = renderHook(() => useDeviceState());
    await flush();
    let p!: Promise<void>;
    act(() => { p = result.current.led('nid', true); });
    unmount();
    await act(async () => { d.resolve(makeState({ t_nid: 77 })); await p; });
    expect(result.current.state?.t_nid).toBe(24.5);
  });
});
