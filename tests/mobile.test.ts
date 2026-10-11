// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useIsMobile } from '@/hooks';
import { partsRows } from '@/features/viewer/components/PartsSheet';
import type { Plank, PlankScene } from '@/birdhouse/model';

const mk = (id: string, over: Partial<Plank> = {}): Plank => ({ id, name: id, w: 10, h: 10, pos: [0, 0, 0], rot: [0, 0, 0], notches: [], holes: [], ...over });

describe('partsRows : lignes du menu mobile afficher / cacher', () => {
  it('un groupe = une ligne, une plaque seule = une ligne, le document est omis', () => {
    const sc: PlankScene = { t: 3, fit: 0, up: 'z2', groupNames: { g: 'Corps' }, planks: [mk('a', { group: 'g' }), mk('doc', { special: 'doc', group: 'd' }), mk('b'), mk('c', { group: 'g' })] };
    const rows = partsRows(sc);
    expect(rows.map((r) => [r.name, r.ids])).toEqual([['Corps', ['a', 'c']], ['b', ['b']]]);
    expect(rows[0].group).toBe('g');
    expect(rows[1].group).toBeNull();
  });
  it('groupe sans nom : « Groupe »', () => {
    expect(partsRows({ t: 3, fit: 0, up: 'z2', planks: [mk('a', { group: 'x' })] })[0].name).toBe('Groupe');
  });
});

describe('useIsMobile', () => {
  it('suit matchMedia', () => {
    let on: (() => void) | null = null;
    const mq = { matches: true, addEventListener: (_: string, f: () => void) => { on = f; }, removeEventListener: vi.fn() };
    window.matchMedia = (() => mq) as unknown as typeof window.matchMedia;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
    mq.matches = false;
    act(() => on?.());
    expect(result.current).toBe(false);
  });
  it('sans matchMedia : faux', () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
    expect(renderHook(() => useIsMobile()).result.current).toBe(false);
  });
});
