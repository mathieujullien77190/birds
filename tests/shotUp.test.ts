import { describe, expect, it } from 'vitest';
import { Matrix4, Vector3 } from 'three';
import { shotUp } from '@/birdhouse/three/cameraShooter';

describe('haut de la caméra de prise de vue', () => {
  it('horizon redressé : +z', () => { expect(shotUp(new Vector3(1, 0, 0), new Vector3(0, 1, 0), true).toArray()).toEqual([0, 0, 1]); });
  it('sans horizon redressé : le haut de la carte', () => { expect(shotUp(new Vector3(1, 0, 0), new Vector3(0, 1, 0), false).toArray()).toEqual([0, 1, 0]); });
  it('regard presque vertical + horizon redressé : haut de secours (celui de la carte), jamais parallèle à la direction', () => {
    for (const z of [-1, 1, 0.99995, -0.99995]) {
      const dir = new Vector3(Math.sqrt(1 - z * z), 0, z).normalize();
      const boardUp = new Vector3(0, 1, 0); // perpendiculaire à la direction (dans le plan xz)
      const up = shotUp(dir, boardUp, true);
      expect(up.toArray()).toEqual([0, 1, 0]);
      expect(new Vector3().crossVectors(up, dir).length()).toBeGreaterThan(0.5); // lookAt non dégénéré
    }
  });
  it('lookAt donne une rotation valide à la verticale', () => {
    const dir = new Vector3(0, 0, -1), up = shotUp(dir, new Vector3(0, 1, 0), true);
    const m = new Matrix4().lookAt(new Vector3(), dir, up);
    expect(Math.abs(m.determinant() - 1)).toBeLessThan(1e-9);
  });
});
