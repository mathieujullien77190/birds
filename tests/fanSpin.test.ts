import { describe, expect, it } from 'vitest';
import { Group, Mesh } from 'three';
import type { Plank } from '@/birdhouse/model';
import { disposeObject3D } from '@/birdhouse/three/dispose';
import { MAX_DT, MAX_REV_PER_S, advanceAngle, spinRotors } from '@/birdhouse/three/fanSpin';
import { createPlankMesh, plankGeometry } from '@/birdhouse/three/factories/plank';
import { hashNumbers } from './helpers';

const fan: Plank = { id: 'f', name: 'Ventilateur', w: 60, h: 60, depth: 25, pos: [0, 0, 0], rot: [0, 0, 0], notches: [], holes: [], special: 'fan', color: '#8b5a2b' };
const TAU = Math.PI * 2;

describe('advanceAngle : vitesse visuelle du rotor', () => {
  it('ne bouge pas à 0 % ni sans temps écoulé', () => {
    expect(advanceAngle(1, 0, 0.5)).toBe(1); expect(advanceAngle(1, 50, 0)).toBe(1); expect(advanceAngle(1, -20, 1)).toBe(1); expect(advanceAngle(1, NaN, 1)).toBe(1);
  });
  it('est proportionnelle au pourcentage et plafonne à 3 tours par seconde', () => {
    const half = advanceAngle(0, 50, 0.1), full = advanceAngle(0, 100, 0.1);
    expect(full).toBeCloseTo(MAX_REV_PER_S * TAU * 0.1, 9); expect(half * 2).toBeCloseTo(full, 9);
    expect(advanceAngle(0, 250, 0.1)).toBeCloseTo(full, 9); // au-delà de 100 % : pas plus vite
    expect(MAX_REV_PER_S).toBe(3);
  });
  it('reste dans [0, 2π[ même pour un grand pas de temps', () => {
    const a = advanceAngle(5, 100, 123.456); expect(a).toBeGreaterThanOrEqual(0); expect(a).toBeLessThan(TAU);
  });
});

describe('rotor du ventilateur : maillage à part', () => {
  it('est un enfant de la mesh, et cadre + rotor redonnent exactement l\'ancien dessin', () => {
    const m = createPlankMesh(fan, 3);
    expect(m.rotor).toBeInstanceOf(Mesh); expect(m.rotor!.parent).toBe(m);
    const g = plankGeometry(fan, 3), a = g.geo.getAttribute('position').array as Float32Array, b = g.rotor!.geo.getAttribute('position').array as Float32Array;
    const cat = (x: Float32Array, y: Float32Array) => { const o = new Float32Array(x.length + y.length); o.set(x); o.set(y, x.length); return o; };
    expect((a.length + b.length) / 3).toBe(1440); expect(hashNumbers(cat(a, b))).toBe('c3ae37edee71385e'); // empreinte de l'ancien ventilateur d'un seul bloc
    expect(hashNumbers(cat(g.geo.getAttribute('color').array as Float32Array, g.rotor!.geo.getAttribute('color').array as Float32Array))).toBe('e1e1b2a5a8543296');
  });
  it('une autre pièce n\'a pas de rotor', () => {
    expect(createPlankMesh({ ...fan, special: undefined, w: 40, h: 30 }, 3).rotor).toBeNull();
  });
  it('spinRotors fait tourner le rotor selon la vitesse, à l\'arrêt il reste en place, le pas est plafonné', () => {
    const m = createPlankMesh(fan, 3), view = { meshes: new Map([['f', m]]), fan: { pct: 0, angle: 0 } };
    spinRotors(view, 1); expect(m.rotor!.rotation.z).toBe(0);
    view.fan.pct = 100; spinRotors(view, 0.05); expect(m.rotor!.rotation.z).toBeCloseTo(MAX_REV_PER_S * TAU * 0.05, 9);
    const before = view.fan.angle; spinRotors(view, 50); expect(view.fan.angle).toBeCloseTo((before + MAX_REV_PER_S * TAU * MAX_DT) % TAU, 9); // un grand pas = au plus MAX_DT
    view.fan.pct = 0; const frozen = m.rotor!.rotation.z; spinRotors(view, 0.1); expect(m.rotor!.rotation.z).toBe(frozen);
  });
  it('dispose libère aussi le rotor et ses arêtes', () => {
    const m = createPlankMesh(fan, 3), root = new Group(); root.add(m);
    const seen = { rotor: 0, edges: 0 };
    m.rotor!.geometry.addEventListener('dispose', () => { seen.rotor++; });
    m.rotor!.children[0] && (m.rotor!.children[0] as Mesh).geometry.addEventListener('dispose', () => { seen.edges++; });
    disposeObject3D(root);
    expect(seen).toEqual({ rotor: 1, edges: 1 });
  });
  it('quand la pièce n\'est plus un ventilateur le rotor est retiré et libéré', () => {
    const m = createPlankMesh(fan, 3); const r = m.rotor!; let n = 0; r.geometry.addEventListener('dispose', () => { n++; });
    m.updateShape({ ...fan, special: undefined, w: 40, h: 30 }, 3);
    expect(m.rotor).toBeNull(); expect(m.children).not.toContain(r); expect(n).toBe(1);
  });
});
