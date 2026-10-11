import { describe, expect, it } from 'vitest';
import { Group } from 'three';
import type { Plank } from '@/birdhouse/model';
import { disposeObject3D } from '@/birdhouse/three/dispose';
import { createPlankMesh } from '@/birdhouse/three/factories/plank';
import { disposeAll, materials } from '@/birdhouse/three/registry/materials';

const plank: Plank = { id: 'a', name: 'a', w: 40, h: 30, pos: [0, 0, 0], rot: [0, 0, 0], notches: [], holes: [] };
const watch = (o: { addEventListener(t: 'dispose', f: () => void): void }) => { const s = { n: 0 }; o.addEventListener('dispose', () => { s.n++; }); return s; };

describe('libération des ressources 3D', () => {
  it('libère la surface, les arêtes et le matériau d\'une plaque, mais pas le matériau partagé des arêtes', () => {
    const m = createPlankMesh(plank, 3);
    const geo = watch(m.geometry), edges = watch(m.edges.geometry), mat = watch(m.material), shared = watch(materials.edge());
    const root = new Group(); root.add(m);
    disposeObject3D(root);
    expect([geo.n, edges.n, mat.n, shared.n]).toEqual([1, 1, 1, 0]);
    disposeAll();
    expect(shared.n).toBe(1); // le registre libère ses matériaux à la fermeture de la vue
  });
  it('le registre recrée ses matériaux après disposeAll', () => {
    const a = materials.edge();
    expect(materials.edge()).toBe(a);
    disposeAll();
    expect(materials.edge()).not.toBe(a);
  });
});
