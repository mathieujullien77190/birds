// Modèle 3D du Pi (forme du Pi 4, mêmes cotes que le Pi 5) : une fois chargé (fetch doublé), piGeometry le clone et la clé de forme de la plaque change.
import { describe, expect, it, vi } from 'vitest';
import type { Plank } from '@/birdhouse/model';
import { loadPiModel, piModel } from '@/birdhouse/three/piModel';
import { piGeometry } from '@/birdhouse/three/factories/part/pi';
import { plankShapeKey } from '@/birdhouse/three/factories/plank';

const pi: Plank = { id: 'pi', name: 'Raspberry Pi', w: 85, h: 56, pos: [0, 0, 0], rot: [0, 0, 0], notches: [], holes: [], special: 'pi' };

/** pi4.bin minimal : un triangle (3 sommets), positions f32, couleurs u8, indices u32. */
function fakeBin(): ArrayBuffer {
  const nV = 3, nI = 3, buf = new ArrayBuffer(8 + nV * 15 + nI * 4), dv = new DataView(buf);
  dv.setUint32(0, nV, true); dv.setUint32(4, nI, true);
  [0, 0, 0, 10, 0, 0, 0, 10, 0].forEach((v, i) => dv.setFloat32(8 + 4 * i, v, true));
  [255, 0, 0, 0, 255, 0, 0, 0, 255].forEach((v, i) => dv.setUint8(8 + nV * 12 + i, v));
  [0, 1, 2].forEach((v, i) => dv.setUint32(8 + nV * 15 + 4 * i, v, true));
  return buf;
}

describe('modèle 3D du Pi (forme du Pi 4)', () => {
  it('avant le chargement : dessin simplifié, clé de forme sans modèle ; après : le modèle (cloné) et une autre clé', async () => {
    expect(piModel).toBeNull();
    const before = plankShapeKey(pi, 3), simple = piGeometry(pi);
    expect(simple.geo.attributes.color).toBeDefined();
    const fetchMock = vi.fn(async () => ({ ok: true, arrayBuffer: async () => fakeBin() }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await loadPiModel(); await loadPiModel(); // le second appel réutilise la promesse
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
    expect(piModel).not.toBeNull();
    expect(piModel!.attributes.position.count).toBe(3);
    expect(piModel!.index).toBeNull(); // ombrage à facettes : non indexé
    const g = piGeometry(pi);
    expect(g.geo).not.toBe(piModel); // c'est un clone : la mesh peut le libérer sans casser le modèle partagé
    expect(g.geo.attributes.position.count).toBe(3);
    expect(g.edges.attributes.position.count).toBe(0);
    expect(g.geo.attributes.color.getX(0)).toBeCloseTo(1, 6); // couleur 255 → 1
    expect(plankShapeKey(pi, 3)).not.toBe(before); // la mesh se refait quand le modèle arrive
    expect(plankShapeKey({ ...pi, special: 'bar' }, 3)).toBe(plankShapeKey({ ...pi, special: 'bar' }, 3));
  });
});
