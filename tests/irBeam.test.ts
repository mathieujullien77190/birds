import { beforeAll, describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Euler, Mesh, Object3D, Quaternion, Raycaster, Scene, SpotLight, Vector3 } from 'three';
import { CameraShooter, type ShotRenderer } from '@/birdhouse/three/cameraShooter';
import { IR_BEAM, IrBeams, ambientFactor, beamDirection, conePose, fadeLevel, targetIntensity } from '@/birdhouse/three/irBeam';
import { buildNest } from './helpers';

beforeAll(() => {
  const ctx = { createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: () => {}, fillRect: () => {}, fillText: () => {}, createRadialGradient: () => ({ addColorStop: () => {} }) };
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ctx, toDataURL: () => 'data:image/jpeg;base64,' }) });
});

const board = (rot: [number, number, number], pos: [number, number, number] = [0, 0, 0]) => { const o = new Object3D(); o.position.set(...pos); o.rotation.set(...rot.map((d) => (d * Math.PI) / 180) as [number, number, number]); return o; };
const spots = (s: Scene) => { const out: SpotLight[] = []; s.traverse((o) => { if (o instanceof SpotLight) out.push(o); }); return out; };

describe('faisceaux infrarouges : fonctions pures', () => {
  it('intensité visée : 0 ou 1', () => { expect(targetIntensity(true)).toBe(1); expect(targetIntensity(false)).toBe(0); });
  it('fondu monotone, atteint la cible, ne la dépasse pas, même avec un grand pas de temps', () => {
    let l = 0; const seen: number[] = [];
    for (let i = 0; i < 20; i++) { l = fadeLevel(l, 1, 0.02); seen.push(l); }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    expect(Math.max(...seen)).toBe(1); // atteint
    expect(seen[Math.round(IR_BEAM.fade / 0.02) - 1]).toBeCloseTo(1, 6); // en 150 ms
    expect(fadeLevel(0, 1, 100)).toBe(1); expect(fadeLevel(1, 0, 100)).toBe(0); expect(fadeLevel(0.3, 0.3, 1)).toBe(0.3); expect(fadeLevel(0.4, 1, 0)).toBe(0.4);
    expect(fadeLevel(0.5, 0, 0.03)).toBeLessThan(0.5); expect(fadeLevel(0.5, 0, 0.03)).toBeGreaterThanOrEqual(0);
  });
  it('de jour plus discret que de nuit', () => { expect(ambientFactor(true)).toBe(1); expect(ambientFactor(false)).toBe(0.5); });
  it('l\'axe du cône est l\'axe d\'objectif de la carte (−z local) : vers le bas pour la carte du nid comme pour celle de l\'extérieur (sur sa plaque, droit vers le bas)', () => {
    const sc = buildNest({}), q = (name: string) => { const p = sc.planks.find((x) => x.name === name)!; return new Quaternion().setFromEuler(new Euler(...(p.rot.map((d) => (d * Math.PI) / 180) as [number, number, number]), 'XYZ')); };
    const nid = beamDirection(q('LED infrarouges')), ext = beamDirection(q('LED infrarouges extérieures'));
    expect(nid.distanceTo(new Vector3(0, 0, -1))).toBeLessThan(1e-6);
    expect(ext.distanceTo(new Vector3(0, 0, -1))).toBeLessThan(1e-6); // le faisceau extérieur regarde droit vers le bas, depuis la plaque au-dessus du trou d'envol
    const pose = conePose(new Vector3(1, 2, 3), ext, 250);
    expect(pose.position.distanceTo(new Vector3(1, 2, 3).addScaledVector(ext, 125))).toBeLessThan(1e-6); // le cône part de la carte
    expect(new Vector3(0, -1, 0).applyQuaternion(pose.quaternion).distanceTo(ext)).toBeLessThan(1e-6);
  });
});

describe('IrBeams : le cône, la lueur et le projecteur', () => {
  const make = () => { const scene = new Scene(), beams = new IrBeams(); scene.add(beams.group, beams.lights); return { scene, beams }; };
  it('éteint : rien de visible, projecteurs à 0 mais toujours dans la scène ; allumé : cône orienté et éclairage', () => {
    const { scene, beams } = make();
    beams.bind('nid', board([0, 0, 0], [10, 20, 30])); beams.bind('ext', board([-90, 0, 180], [0, -100, 50]));
    beams.update(0.016);
    expect(beams.group.children.every((c) => !c.visible)).toBe(true); expect(spots(scene)).toHaveLength(2); expect(spots(scene).every((s) => s.intensity === 0)).toBe(true);
    beams.set('nid', true); beams.update(1);
    const cone = beams.group.children[0] as Mesh;
    expect(cone.visible).toBe(true); expect(beams.levelOf('nid')).toBe(1);
    expect(new Vector3(0, -1, 0).applyQuaternion(cone.quaternion).distanceTo(new Vector3(0, 0, -1))).toBeLessThan(1e-6);
    expect(cone.position.distanceTo(new Vector3(10, 20, 30 - IR_BEAM.length.nid / 2))).toBeLessThan(1e-6);
    const [snid, sext] = spots(scene); expect(snid.intensity).toBeCloseTo(IR_BEAM.spot.intensity * IR_BEAM.dayFactor, 6); expect(sext.intensity).toBe(0); // jour : demi-intensité ; la carte extérieure reste éteinte
    beams.setNight(true); beams.update(0.016); expect(snid.intensity).toBeCloseTo(IR_BEAM.spot.intensity, 6);
    expect(snid.target.position.distanceTo(new Vector3(10, 20, 30 - IR_BEAM.spot.targetDistance))).toBeLessThan(1e-6); // dirigé comme le cône
    beams.dispose();
  });
  it('sans carte liée, pas de faisceau même allumé ; le fondu s\'éteint', () => {
    const { beams } = make(); beams.set('ext', true); beams.update(1);
    expect(beams.group.children.every((c) => !c.visible)).toBe(true);
    beams.bind('ext', board([0, 0, 0])); beams.update(0.016); expect((beams.group.children[2] as Mesh).visible).toBe(true);
    beams.set('ext', false); beams.update(1); expect(beams.levelOf('ext')).toBe(0); expect((beams.group.children[2] as Mesh).visible).toBe(false);
    beams.dispose();
  });
  it('ne gêne ni la sélection ni le survol : le rayon ne touche ni cône ni lueur', () => {
    const { scene, beams } = make(); beams.bind('nid', board([0, 0, 0])); beams.set('nid', true); beams.update(1);
    const ray = new Raycaster(new Vector3(0, 0, 50), new Vector3(0, 0, -1)); ray.camera = undefined as never;
    expect(ray.intersectObjects(scene.children, true)).toEqual([]);
    beams.dispose();
  });
  it('suspend cache les faisceaux et éteint les projecteurs sans en retirer, puis remet tout', () => {
    const { scene, beams } = make(); beams.bind('nid', board([0, 0, 0])); beams.set('nid', true); beams.update(1);
    const before = spots(scene).map((s) => s.intensity), vis = beams.group.children.map((c) => c.visible);
    const resume = beams.suspend();
    expect(beams.group.children.every((c) => !c.visible)).toBe(true); expect(spots(scene)).toHaveLength(2); expect(spots(scene).every((s) => s.intensity === 0)).toBe(true);
    beams.update(0.016); expect(spots(scene).every((s) => s.intensity === 0)).toBe(true); // même si la boucle tourne pendant la prise
    resume();
    expect(spots(scene).map((s) => s.intensity)).toEqual(before); expect(beams.group.children.map((c) => c.visible)).toEqual(vis);
    beams.dispose();
  });
  it('dispose libère géométries, matériaux, texture et lumières', () => {
    const { scene, beams } = make(); const n = { g: 0, m: 0 };
    for (const c of beams.group.children) { const o = c as Mesh; if (o.geometry && o.geometry.type === 'ConeGeometry') o.geometry.addEventListener('dispose', () => { n.g++; }); (o.material as { addEventListener(t: 'dispose', f: () => void): void }).addEventListener('dispose', () => { n.m++; }); }
    beams.dispose();
    expect(n).toEqual({ g: 2, m: 4 }); expect(spots(scene)).toHaveLength(0); expect(beams.group.children).toHaveLength(0);
  });
});

describe('CameraShooter et faisceaux', () => {
  it('masque les faisceaux pendant la prise de vue et les remet ensuite, même si le rendu échoue', () => {
    const scene = new Scene(), b = new Mesh(new BoxGeometry()); scene.add(b);
    const log: string[] = [];
    const mk = (fail: boolean): ShotRenderer => ({ getRenderTarget: () => null, setRenderTarget: () => {}, render: () => { log.push('render'); if (fail) throw new Error('GPU'); }, readRenderTargetPixels: () => {} });
    const stub = { suspend: () => { log.push('suspend'); return () => { log.push('resume'); }; } };
    const s1 = new CameraShooter(scene, mk(false), []); s1.beams = stub; s1.shoot(b, 'a');
    expect(log).toEqual(['suspend', 'render', 'resume']);
    log.length = 0; const s2 = new CameraShooter(scene, mk(true), []); s2.beams = stub;
    expect(() => s2.shoot(b, 'x')).toThrow('GPU'); expect(log).toEqual(['suspend', 'render', 'resume']);
  });
});
