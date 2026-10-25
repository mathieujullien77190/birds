// @vitest-environment jsdom
// Étiquettes des codes de plaques (T01…) sur la 3D, sans WebGL : le canvas 2D est doublé. Ressources partagées du registre, libération, clics.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Raycaster, Vector3 } from 'three';
import { codeSpot, type Plank } from '@/birdhouse/model';
import { disposeObject3D } from '@/birdhouse/three/dispose';
import { createCodeLabel } from '@/birdhouse/three/factories/codeLabel';
import { createPlankMesh } from '@/birdhouse/three/factories/plank';
import { disposeAll, geometries, isShared, shared } from '@/birdhouse/three/registry/materials';

const P = (over: Partial<Plank> = {}): Plank => ({ id: 'p', name: 'p', w: 100, h: 50, pos: [0, 0, 0], rot: [0, 0, 0], notches: [], holes: [], ...over });
const watch = (o: { addEventListener(t: 'dispose', f: () => void): void }) => { const s = { n: 0 }; o.addEventListener('dispose', () => { s.n++; }); return s; };

let calls: string[];
beforeEach(() => {
  calls = [];
  const ctx = { beginPath: () => calls.push('begin'), moveTo: () => calls.push('move'), lineTo: () => calls.push('line'), closePath: () => calls.push('close'), fill: () => calls.push('fill'), fillStyle: '', strokeStyle: '', lineWidth: 0, lineJoin: '', stroke: () => calls.push('stroke') };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
});
afterEach(() => { vi.restoreAllMocks(); disposeAll(); });

describe('registre : ressources à clé', () => {
  it('même clé : même objet jusqu’à disposeAll, qui libère tout et en laisse recréer', () => {
    const make = vi.fn(() => ({ n: 0, dispose() { this.n++; } }));
    const a = shared('k', make), b = shared('k', make);
    expect(a).toBe(b);
    expect(make).toHaveBeenCalledTimes(1);
    expect(isShared(a)).toBe(true);
    const plane = geometries.unitPlane();
    expect(geometries.unitPlane()).toBe(plane);
    disposeAll();
    expect(a.n).toBe(1);
    expect(shared('k', make)).not.toBe(a);
  });
});

describe('étiquette d’un code', () => {
  it('un carré à la taille du texte posé sur la face +z, couché si le texte l’est, jamais cliquable', () => {
    const p = P(), spot = codeSpot(p, 3)!;
    const l = createCodeLabel('T-01', spot, 3);
    expect(l.geometry).toBe(geometries.unitPlane());
    expect(l.scale.y).toBeCloseTo(5.6, 6);
    expect(l.position.z).toBeGreaterThan(1.5);
    expect(l.rotation.z).toBe(0);
    const turned = createCodeLabel('T-01', { ...spot, turned: true }, 3);
    expect(turned.rotation.z).toBeCloseTo(Math.PI / 2, 9);
    const ray = new Raycaster(new Vector3(spot.x, spot.y, 50), new Vector3(0, 0, -1));
    expect(ray.intersectObject(l, false)).toEqual([]); // raycast neutralisé : le clic passe à la plaque
  });
  it('dessine les MÊMES traits que la gravure, une seule texture et un seul matériau par code', () => {
    const spot = codeSpot(P(), 3)!;
    const a = createCodeLabel('T-01', spot, 3), b = createCodeLabel('T-01', spot, 3), c = createCodeLabel('T-02', spot, 3);
    expect(a.material).toBe(b.material);
    expect(c.material).not.toBe(a.material);
    expect(calls.filter((x) => x === 'fill')).toHaveLength(2 * (10 + 13)); // T-01 : 10 segments, T-02 : 13, deux rectangles par segment (contour et second trait), dessinés une fois par code
    expect(a.material.map!.colorSpace).toBe('srgb');
  });
});

describe('PlankMesh.setCode', () => {
  it('pose, garde, remplace et retire l’étiquette sans libérer les ressources partagées', () => {
    const p = P(), m = createPlankMesh(p, 3);
    expect(m.label).toBeNull();
    m.setCode('T-01', p, 3);
    const first = m.label!;
    expect(first.parent).toBe(m);
    m.setCode('T-01', p, 3);
    expect(m.label).toBe(first); // rien n'est refait
    m.setCode('T-02', p, 3);
    expect(m.label).not.toBe(first);
    expect(first.parent).toBeNull();
    const geo = watch(m.label!.geometry), mat = watch(m.label!.material);
    m.setCode(null, p, 3);
    expect(m.label).toBeNull();
    m.setCode(null, p, 3);
    expect([geo.n, mat.n]).toEqual([0, 0]);
  });
  it('la plaque libérée ne libère ni le carré ni le matériau de l’étiquette (registre) ; l’okoumé a sa propre épaisseur', () => {
    const p = P({ material: 'okoume', depth: 5 }), m = createPlankMesh(p, 3);
    m.setCode('H-01', p, 3);
    expect(m.label!.position.z).toBeCloseTo(2.5 + 0.08, 9);
    const geo = watch(m.label!.geometry), mat = watch(m.label!.material), tex = watch(m.label!.material.map!);
    disposeObject3D(m);
    expect([geo.n, mat.n, tex.n]).toEqual([0, 0, 0]);
    disposeAll();
    expect([geo.n, mat.n, tex.n]).toEqual([1, 1, 1]);
  });
  it('okoumé sans épaisseur propre : celle de la scène', () => {
    const p = P({ material: 'okoume' }), m = createPlankMesh(p, 3);
    m.setCode('H-02', p, 3);
    expect(m.label!.position.z).toBeCloseTo(1.5 + 0.08, 9);
  });
  it('plaque trop petite pour un code : pas d’étiquette', () => {
    const p = P({ w: 1.5, h: 1.5 }), m = createPlankMesh(p, 3);
    m.setCode('T-01', p, 3);
    expect(m.label).toBeNull();
  });
});
