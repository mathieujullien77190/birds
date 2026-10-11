import { describe, expect, it } from 'vitest';
import { startRenderLoop, type LoopEnv } from '@/birdhouse/three/scene/renderLoop';

/** Un navigateur doublé : les images sont déclenchées à la main. */
function fakeEnv() {
  let pending: FrameRequestCallback | null = null, nextId = 1, hidden = false;
  const cancelled: number[] = [];
  const env: LoopEnv = { request: (cb) => { pending = cb; return nextId++; }, cancel: (id) => { cancelled.push(id); pending = null; }, hidden: () => hidden };
  return { env, cancelled, tick: () => { const cb = pending; pending = null; cb?.(0); }, setHidden: (h: boolean) => { hidden = h; }, hasPending: () => pending !== null };
}

describe('boucle de rendu', () => {
  it('rend la première image tout de suite, puis une par image', () => {
    const f = fakeEnv(); let n = 0;
    startRenderLoop(() => { n++; }, f.env);
    expect(n).toBe(1);
    f.tick(); f.tick();
    expect(n).toBe(3);
  });
  it('ne rend rien tant que la page est cachée, et reprend ensuite', () => {
    const f = fakeEnv(); let n = 0;
    startRenderLoop(() => { n++; }, f.env);
    f.setHidden(true);
    f.tick(); f.tick(); f.tick();
    expect(n).toBe(1);
    f.setHidden(false);
    f.tick();
    expect(n).toBe(2);
  });
  it('s\'arrête pour de bon', () => {
    const f = fakeEnv(); let n = 0;
    const stop = startRenderLoop(() => { n++; }, f.env);
    stop();
    expect(f.cancelled.length).toBe(1);
    expect(f.hasPending()).toBe(false);
    f.tick();
    expect(n).toBe(1);
  });
});
