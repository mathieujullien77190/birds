import { describe, it } from 'vitest';
import type { BufferGeometry } from 'three';
import { plankGeometry } from '@/birdhouse/three/factories/plank';
import { VARIANTS, buildNestFull, expectGolden, hashNumbers } from './helpers';

/** Empreinte d'une géométrie : nombre de sommets, hash des positions et des couleurs (arrondies à 1e-4). */
function fingerprint(g: BufferGeometry) {
  const pos = g.getAttribute('position'), col = g.getAttribute('color');
  return { n: pos.count, idx: g.index ? g.index.count : 0, pos: hashNumbers(pos.array), col: col ? hashNumbers(col.array) : null };
}

// le modèle binaire du Pi n'est jamais chargé dans les tests : `piModel` reste null (dessin simplifié du Pi 5)
describe('géométrie 3D de chaque plaque (golden)', () => {
  for (const [name, over] of Object.entries(VARIANTS)) {
    it(name, () => {
      const sc = buildNestFull(over);
      const out: Record<string, unknown> = {};
      sc.planks.forEach((p, i) => {
        if (p.special === 'doc') return;
        const { geo, edges } = plankGeometry(p, sc.t);
        out[`${String(i).padStart(3, '0')} ${p.name}`] = { geo: fingerprint(geo), edges: fingerprint(edges) };
      });
      expectGolden(`geometry-${name}`, out);
    });
  }
});
