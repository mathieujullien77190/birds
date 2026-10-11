import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Plank } from '@/birdhouse/model';
import { createPlankMesh } from '@/birdhouse/three/factories/plank';
import { disposeAll, textures } from '@/birdhouse/three/registry/materials';

const plank: Plank = { id: 'a', name: 'Toit en chêne', w: 40, h: 30, pos: [0, 0, 0], rot: [0, 0, 0], notches: [], holes: [] };

beforeAll(() => {
  // un canvas factice : la texture de chêne se dessine pixel par pixel, ce test n'en regarde pas le contenu
  const ctx = { createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: () => {} };
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });
});
afterEach(() => disposeAll());

describe('texture de chêne', () => {
  it('est posée sur le pan de toit en chêne', () => {
    const m = createPlankMesh(plank, 3);
    m.setOak(true);
    expect(m.material.map).toBe(textures.oak());
    expect(m.material.vertexColors).toBe(false);
  });
  it('est retirée quand la plaque est renommée : retour aux couleurs par sommet', () => {
    const m = createPlankMesh(plank, 3);
    m.setOak(true);
    m.setOak(false);
    expect(m.material.map).toBeNull();
    expect(m.material.vertexColors).toBe(true);
    expect(m.material.roughness).toBe(0.85);
  });
  it('ne touche pas à une plaque ordinaire', () => {
    const m = createPlankMesh({ ...plank, name: 'autre' }, 3);
    m.setOak(false);
    expect(m.material.map).toBeNull();
    expect(m.material.vertexColors).toBe(true);
  });
});
