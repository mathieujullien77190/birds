import { describe, expect, it } from 'vitest';
import { Group, Raycaster, Vector3 } from 'three';
import type { Plank } from '@/birdhouse/model';
import { disposeObject3D } from '@/birdhouse/three/dispose';
import { createPlankMesh, type PlankMesh } from '@/birdhouse/three/factories/plank';
import { GHOST, fadeOpacity, ghostTarget, isGhostPart, stepGhost } from '@/birdhouse/three/ghost';
import { buildNest } from './helpers';

const plank = (name: string, over: Partial<Plank> = {}): Plank => ({ id: name, name, w: 60, h: 60, pos: [0, 0, 0], rot: [0, 0, 0], notches: [], holes: [], ...over });
const mesh = (name: string, over: Partial<Plank> = {}): PlankMesh => { const m = createPlankMesh(plank(name, over), 3); m.ghost = isGhostPart(name); m.baseTransparent = !!over.transparent; return m; };
const view = (...ms: PlankMesh[]) => ({ meshes: new Map(ms.map((m, i) => [String(i), m])), fan: { pct: 0, angle: 0 }, ghost: { level: 1 } });

describe('cassette fantôme', () => {
  it('seules les plaques de la cassette du ventilateur sont concernées, pas le bloc d\'hiver ni la poignée, la grille, les plots, le ventilateur', () => {
    const sc = buildNest({}), ghosts = sc.planks.filter((p) => isGhostPart(p.name)).map((p) => p.name);
    expect(ghosts.sort()).toEqual(['Cassette ventilateur 1', 'Cassette ventilateur 2', 'Cassette ventilateur 3', 'Cassette ventilateur 4', 'Cassette ventilateur cadre du bas', 'Cassette ventilateur couvercle']);
    for (const n of ["Bloc isolant d'hiver 1", "Bloc isolant d'hiver couvercle", 'Poignée cassette 2', 'Plot caoutchouc ventilateur 1', 'Ventilateur Noctua NF-A6x25 PWM (60 × 60 × 25)', "Grille de protection ventilateur 60 mm (fil d'acier)"]) expect(isGhostPart(n), n).toBe(false);
  });
  it('l\'opacité visée passe à 0,28 quand le ventilateur tourne et revient à 1 à l\'arrêt', () => {
    expect(ghostTarget(0)).toBe(1); expect(ghostTarget(1)).toBe(GHOST.opacity); expect(ghostTarget(80)).toBe(0.5);
  });
  it('fondu monotone en 200 ms, atteint la cible sans la dépasser, même avec un grand pas', () => {
    let o = 1; const seen: number[] = [];
    for (let i = 0; i < 12; i++) { o = fadeOpacity(o, 0.5, 0.02); seen.push(o); }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeLessThanOrEqual(seen[i - 1]);
    expect(seen[9]).toBeCloseTo(0.5, 6); expect(Math.min(...seen)).toBe(0.5);
    expect(fadeOpacity(1, 0.5, 100)).toBe(0.5); expect(fadeOpacity(0.5, 1, 100)).toBe(1); expect(fadeOpacity(0.5, 1, 0)).toBe(0.5);
    let u = 0.5; for (let i = 0; i < 12; i++) { const n = fadeOpacity(u, 1, 0.02); expect(n).toBeGreaterThanOrEqual(u); u = n; } expect(u).toBe(1);
  });
  it('stepGhost : la cassette devient translucide, le ventilateur, le bloc et la poignée restent opaques, puis tout redevient opaque à l\'arrêt', () => {
    const wall = mesh('Cassette ventilateur 1'), fan = mesh('Ventilateur Noctua', { special: 'fan', depth: 25 }), block = mesh("Bloc isolant d'hiver 1"), handle = mesh('Poignée cassette 2'), v = view(wall, fan, block, handle);
    stepGhost(v, 0.05); expect(wall.material.opacity).toBe(1); expect(wall.material.transparent).toBe(false); // à l'arrêt : opaque
    v.fan.pct = 60; stepGhost(v, 0.1); expect(wall.material.opacity).toBeLessThan(1); expect(wall.material.opacity).toBeGreaterThan(GHOST.opacity); expect(wall.material.transparent).toBe(true); expect(wall.material.depthWrite).toBe(false);
    stepGhost(v, 1); expect(wall.material.opacity).toBeCloseTo(0.5, 6);
    for (const m of [fan, block, handle]) { expect(m.material.opacity, 'opaque').toBe(1); expect(m.material.transparent).toBe(false); } // le rotor (matériau du ventilateur) reste bien visible
    expect(fan.rotor!.material).toBe(fan.material);
    v.fan.pct = 0; stepGhost(v, 1); expect(wall.material.opacity).toBe(1); expect(wall.material.transparent).toBe(false); expect(wall.material.depthWrite).toBe(true);
  });
  it('une plaque demandée translucide par le modèle le reste (0,3) une fois le fantôme levé', () => {
    const m = mesh('Cassette ventilateur couvercle', { transparent: true }), v = view(m); v.fan.pct = 50; stepGhost(v, 1); expect(m.material.opacity).toBeCloseTo(0.3, 6); // plus translucide que le fantôme (0,5) : on garde 0,3
    v.fan.pct = 0; stepGhost(v, 1); expect(m.material.opacity).toBe(0.3); expect(m.material.transparent).toBe(true);
  });
  it('un clic sur la cassette fantôme la sélectionne toujours, et dispose ne fuit pas', () => {
    const m = mesh('Cassette ventilateur 1', { w: 20, h: 20 }), v = view(m), root = new Group(); root.add(m); v.fan.pct = 70; stepGhost(v, 1); root.updateMatrixWorld(true);
    const hit = new Raycaster(new Vector3(0, 0, 50), new Vector3(0, 0, -1)).intersectObject(m, false); expect(hit.length).toBeGreaterThan(0);
    const n = { mat: 0 }; m.material.addEventListener('dispose', () => { n.mat++; }); disposeObject3D(root); expect(n.mat).toBe(1); // le matériau de la plaque est libéré avec elle, aucun autre n'a été créé
  });
});
