import { describe, expect, it } from 'vitest';
import type { Plank } from '@/birdhouse/model';
import { createPlankMesh, plankShapeKey } from '@/birdhouse/three/factories/plank';

const base: Plank = { id: 'a', name: 'a', w: 40, h: 30, pos: [0, 0, 0], rot: [0, 0, 0], notches: [], holes: [], special: 'block', depth: 10, color: '#ff0000' };

describe('clé de cache de la géométrie d\'une plaque', () => {
  it('change avec tout ce qui change le dessin', () => {
    const k = plankShapeKey(base, 3);
    for (const over of [{ w: 41 }, { color: '#00ff00' }, { poly: [[-20, -15], [20, -15], [0, 15]] as [number, number][] }, { material: 'okoume' as const }, { special: 'bar' as const }, { depth: 11 }]) {
      expect(plankShapeKey({ ...base, ...over }, 3)).not.toBe(k);
    }
    expect(plankShapeKey(base, 4)).not.toBe(k);
  });
  it('ne change pas avec la position, la rotation ou le nom', () => {
    expect(plankShapeKey({ ...base, pos: [5, 5, 5], rot: [90, 0, 0], name: 'autre' }, 3)).toBe(plankShapeKey(base, 3));
  });
  it('une couleur changée refait la géométrie (couleurs par sommet)', () => {
    const m = createPlankMesh(base, 3);
    const before = m.geometry;
    m.updateShape({ ...base, color: '#00ff00' }, 3);
    expect(m.geometry).not.toBe(before);
    const col = m.geometry.getAttribute('color');
    expect([col.getX(0), col.getY(0), col.getZ(0)]).toEqual([0, 1, 0]);
    const same = m.geometry;
    m.updateShape({ ...base, color: '#00ff00' }, 3);
    expect(m.geometry).toBe(same); // forme inchangée : géométrie gardée
  });
});
