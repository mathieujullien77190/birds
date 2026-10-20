import { describe, it } from 'vitest';
import type { BufferGeometry } from 'three';
import type { Plank } from '@/birdhouse/model';
import { plankGeometry } from '@/birdhouse/three/factories/plank';
import { expectGolden, hashNumbers } from './helpers';

const fp = (g: BufferGeometry) => { const c = g.getAttribute('color'); return { n: g.getAttribute('position').count, pos: hashNumbers(g.getAttribute('position').array), col: c ? hashNumbers(c.array) : null }; };
const base: Plank = { id: 'x', name: 'x', w: 40, h: 30, pos: [0, 0, 0], rot: [0, 0, 0], notches: [], holes: [] };
const path: [number, number, number][] = [[0, 0, 0], [20, 0, 10], [40, 15, 10], [60, 15, 40]];

/** Une pièce de chaque type spécial, pour que le déplacement des fabriques soit couvert au-delà des scènes de nichoir. */
describe('une géométrie par type de pièce (golden)', () => {
  it('toutes les pièces spéciales', () => {
    const out: Record<string, unknown> = {};
    const cases: [string, Partial<Plank>][] = [
      ['plaque', {}], ['plaque percée', { holes: [{ id: 'h', shape: 'round', x: 0, y: 0, size: 10 }] }], 
      ['case', { special: 'case', w: 105, h: 68 }], ['fan', { special: 'fan', w: 60, h: 60, depth: 25, color: '#8b5a2b' }],
      ['driver', { special: 'driver', depth: 20 }], ['guard', { special: 'guard', w: 60, h: 60, depth: 3 }],
      ['sensor', { special: 'sensor', w: 15, h: 11 }], ['block', { special: 'block', depth: 12 }], ['block percé', { special: 'block', depth: 12, holes: [{ id: 'h', shape: 'round', x: 0, y: 0, size: 10 }] }],
      ['block poly', { special: 'block', depth: 12, poly: [[-20, -15], [20, -15], [20, 15]] }],
      ['cable', { special: 'cable', w: 16, path }], ['conduit', { special: 'conduit', w: 16, path }], ['wire', { special: 'wire', w: 2.4, path, color: '#ff0000' }],
      ['pi', { special: 'pi', w: 85, h: 56 }], ['bar', { special: 'bar', w: 50, h: 10 }], ['ir', { special: 'ir', w: 12, h: 24 }], ['camera', { special: 'camera', w: 25, h: 24 }],
    ];
    for (const [name, over] of cases) { const { geo, edges } = plankGeometry({ ...base, ...over }, 3); out[name] = { geo: fp(geo), edges: fp(edges) }; }
    expectGolden('parts', out);
  });
});
