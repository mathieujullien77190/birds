import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Group, Mesh, PointLight, Scene, BoxGeometry } from 'three';
import { CameraShooter, type ShotRenderer } from '@/birdhouse/three/cameraShooter';

const lampOf = (scene: Scene) => scene.children.filter((o): o is PointLight => o instanceof PointLight)[0];

/** Un renderer doublé : il note l'intensité de la lampe pendant chaque rendu. */
function fakeRenderer(scene: Scene, onRender: () => void = () => {}) {
  const seen: number[] = [];
  const targets: unknown[] = []; // cibles de rendu posées, dans l'ordre : la dernière doit être la cible d'origine (null)
  const renderer: ShotRenderer = {
    getRenderTarget: () => null,
    setRenderTarget: (t) => { targets.push(t); },
    render: () => { onRender(); seen.push(lampOf(scene)?.intensity ?? -1); },
    readRenderTargetPixels: () => {},
  };
  return { renderer, seen, targets };
}

beforeAll(() => {
  const ctx = { createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: () => {}, fillRect: () => {}, fillText: () => {} };
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, toDataURL: () => 'data:image/jpeg;base64,' }) });
});

describe('CameraShooter', () => {
  it('garde une seule lampe dans la scène, allumée seulement pendant une prise infrarouge', () => {
    const scene = new Scene(), overlay = new Group(), board = new Mesh(new BoxGeometry());
    scene.add(overlay, board);
    const { renderer, seen } = fakeRenderer(scene);
    const shooter = new CameraShooter(scene, renderer, [overlay]);
    const lights = () => scene.children.filter((o) => o instanceof PointLight).length;
    expect(lights()).toBe(1);
    shooter.shoot(board, 'a', { ir: true, night: true });
    shooter.shoot(board, 'b');
    shooter.shoot(board, 'c', { ir: true });
    expect(lights()).toBe(1); // jamais ajoutée ni retirée : plus de recompilation des shaders
    expect(seen).toEqual([2.6, 0, 2.6]);
    expect(lampOf(scene).intensity).toBe(0);
    shooter.dispose();
    expect(lights()).toBe(0);
  });
  it('rend à la vue son état même si le rendu échoue (cible, lampe, visibilités)', () => {
    const scene = new Scene(), overlay = new Group(), board = new Mesh(new BoxGeometry());
    scene.add(overlay, board);
    const { renderer, targets } = fakeRenderer(scene, () => { throw new Error('GPU'); });
    const shooter = new CameraShooter(scene, renderer, [overlay]);
    expect(() => shooter.shoot(board, 'x', { ir: true })).toThrow('GPU');
    expect(targets.length).toBe(2);
    expect(targets[1]).toBeNull(); // la cible d'origine est rétablie
    expect(overlay.visible).toBe(true);
    expect(board.visible).toBe(true);
    expect(lampOf(scene).intensity).toBe(0);
  });
  it('cache les repères et la carte pendant la prise', () => {
    const scene = new Scene(), overlay = new Group(), board = new Mesh(new BoxGeometry());
    scene.add(overlay, board);
    let during: boolean[] = [];
    const { renderer } = fakeRenderer(scene, () => { during = [overlay.visible, board.visible]; });
    new CameraShooter(scene, renderer, [overlay]).shoot(board, 'x');
    expect(during).toEqual([false, false]);
  });
});
