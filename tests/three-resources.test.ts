// Ressources 3D sans WebGL : libération (dispose), fantôme de la cassette, boucle de rendu arrêtée, prise de vue de la caméra, fusion de géométries.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AmbientLight, BoxGeometry, BufferGeometry, Color, DirectionalLight, Float32BufferAttribute, Group, Line, MeshBasicMaterial, Mesh, Points, PointsMaterial, Scene, Sprite, SpriteMaterial, Texture, WebGLRenderTarget } from 'three';
import { clearGroup, disposeObject3D } from '@/birdhouse/three/dispose';
import { GHOST, fadeOpacity, stepGhost } from '@/birdhouse/three/ghost';
import { coloredPart, emptyEdges, mergeColored, paintUniform } from '@/birdhouse/three/factories/geometry';
import { startRenderLoop, type LoopEnv } from '@/birdhouse/three/scene/renderLoop';
import { CameraShooter, type ShotRenderer } from '@/birdhouse/three/cameraShooter';
import { AMBIENCE, CAMERA_SHOT } from '@/birdhouse/three/constants';
import { disposeAll, textures } from '@/birdhouse/three/registry/materials';
import type { PlankMesh } from '@/birdhouse/three/factories/plank';
import type { View } from '@/birdhouse/three/types';

/** Compte les `dispose` d'une ressource. */
const watch = (o: { addEventListener(t: 'dispose', f: () => void): void }) => { const s = { n: 0 }; o.addEventListener('dispose', () => { s.n++; }); return s; };

describe('dispose : cas non couverts', () => {
  afterEach(() => disposeAll());

  it('un Sprite libère son matériau et sa texture, jamais sa géométrie (commune à tous)', () => {
    const map = new Texture(), mat = new SpriteMaterial({ map }), sp = new Sprite(mat);
    const m = watch(mat), tx = watch(map), g = watch(sp.geometry);
    disposeObject3D(sp);
    expect([m.n, tx.n, g.n]).toEqual([1, 1, 0]);
  });
  it('ne libère pas une texture partagée du registre (chêne) mais libère le matériau qui la porte', () => {
    const ctx = { createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: () => {} };
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });
    try {
      const oak = textures.oak(), mat = new MeshBasicMaterial({ map: oak }), mesh = new Mesh(new BoxGeometry(), mat);
      const o = watch(oak), m = watch(mat);
      disposeObject3D(mesh);
      expect([o.n, m.n]).toEqual([0, 1]);
    } finally { vi.unstubAllGlobals(); }
  });
  it('libère un Mesh à matériaux multiples, une Line et des Points (géométrie + matériau)', () => {
    const m1 = new MeshBasicMaterial(), m2 = new MeshBasicMaterial(), mesh = new Mesh(new BoxGeometry(), [m1, m2]);
    const line = new Line(new BufferGeometry(), new MeshBasicMaterial()), pts = new Points(new BufferGeometry(), new PointsMaterial());
    const w = [watch(m1), watch(m2), watch(mesh.geometry), watch(line.geometry), watch(line.material as MeshBasicMaterial), watch(pts.geometry), watch(pts.material as PointsMaterial)];
    const root = new Group(); root.add(mesh, line, pts);
    disposeObject3D(root);
    expect(w.map((x) => x.n)).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });
  it('clearGroup retire chaque enfant du groupe ET le libère', () => {
    const a = new Mesh(new BoxGeometry(), new MeshBasicMaterial()), b = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const ga = watch(a.geometry), gb = watch(b.geometry);
    const group = new Group(); group.add(a, b);
    clearGroup(group);
    expect(group.children).toHaveLength(0);
    expect(a.parent).toBeNull();
    expect([ga.n, gb.n]).toEqual([1, 1]);
  });
});

describe('fantôme de la cassette', () => {
  const fake = (over: { ghost?: boolean; baseTransparent?: boolean; transparent?: boolean }) => ({ ghost: over.ghost ?? true, baseTransparent: over.baseTransparent ?? false, material: { opacity: 0.5, depthWrite: false, transparent: over.transparent ?? true, needsUpdate: false } });
  const view = (meshes: ReturnType<typeof fake>[], pct: number, level: number) => ({ meshes: new Map(meshes.map((m, i) => [String(i), m as unknown as PlankMesh])), fan: { pct, angle: 0 }, ghost: { level } }) as Pick<View, 'meshes' | 'fan' | 'ghost'>;

  it('sans fantôme la plaque redevient opaque : opacité 1, écriture de profondeur, matériau marqué à recompiler', () => {
    const m = fake({ transparent: true });
    stepGhost(view([m], 80, 1), 0.016);
    expect(m.material).toMatchObject({ opacity: 1, depthWrite: true, transparent: false, needsUpdate: true });
  });
  it('ne touche pas aux plaques qui ne sont pas de la cassette', () => {
    const m = fake({ ghost: false });
    stepGhost(view([m], 80, 1), 0.016);
    expect(m.material).toEqual({ opacity: 0.5, depthWrite: false, transparent: true, needsUpdate: false });
  });
  it('une plaque demandée translucide par le modèle reste à 30 % et garde son état transparent (pas de recompilation)', () => {
    const m = fake({ baseTransparent: true, transparent: true });
    stepGhost(view([m], 0, 1), 0.016);
    expect(m.material).toMatchObject({ opacity: 0.3, depthWrite: false, transparent: true, needsUpdate: false });
  });
  it('un niveau fantôme < 1 rend la plaque transparente', () => {
    const m = fake({ transparent: false }), v = view([m], 0, 0.5);
    stepGhost(v, 0.1);
    expect(m.material).toMatchObject({ opacity: 0.5, transparent: true, depthWrite: false, needsUpdate: true });
    expect(v.ghost.level).toBe(0.5); // l'opacité cible reste 1 : avec GHOST.opacity = 1 le pas de fondu est nul
  });
  it('fadeOpacity : sans temps écoulé (ou temps négatif / NaN) rien ne bouge', () => {
    for (const dt of [0, -1, NaN]) expect(fadeOpacity(0.7, 1, dt)).toBe(0.7);
  });
  it('fadeOpacity avec un vrai fondu : monotone, plafonné par la cible, dans les deux sens', () => {
    const g = GHOST as { opacity: number; fade: number };
    const saved = g.opacity; g.opacity = 0.4;
    try {
      expect(fadeOpacity(1, 0.4, 0.1)).toBeCloseTo(0.7, 9); // descend de (1 − 0,4) × 0,1 / 0,2 = 0,3
      expect(fadeOpacity(0.5, 0.4, 10)).toBe(0.4); // pas de dépassement même avec un grand pas
      expect(fadeOpacity(0.4, 1, 0.1)).toBeCloseTo(0.7, 9); // remonte
      expect(fadeOpacity(0.9, 1, 10)).toBe(1);
    } finally { g.opacity = saved; }
  });
});

describe('boucle de rendu', () => {
  it("une image déjà demandée qui arrive APRÈS l'arrêt ne rend rien et ne redemande rien", () => {
    let pending: FrameRequestCallback | null = null, requests = 0;
    const env: LoopEnv = { request: (cb) => { pending = cb; requests++; return requests; }, cancel: () => {}, hidden: () => false }; // cancel qui n'annule pas : course réelle possible
    let n = 0;
    const stop = startRenderLoop(() => { n++; }, env);
    stop();
    (pending as unknown as FrameRequestCallback)(0);
    expect([n, requests]).toEqual([1, 1]);
  });
});

describe('mergeColored / paintUniform / coloredPart', () => {
  it('peint chaque sommet de la couleur donnée', () => {
    const g = new BoxGeometry(1, 1, 1); paintUniform(g, new Color('#336699'));
    const c = g.attributes.color, e = new Color('#336699');
    expect(c.count).toBe(g.attributes.position.count);
    for (let i = 0; i < c.count; i++) { expect(c.getX(i)).toBeCloseTo(e.r, 6); expect(c.getZ(i)).toBeCloseTo(e.b, 6); }
  });
  it('coloredPart fusionne les morceaux (sommets cumulés, non indexé, sans UV) et fournit des arêtes', () => {
    const a = new BoxGeometry(1, 1, 1), b = new BoxGeometry(2, 2, 2);
    const na = a.toNonIndexed().attributes.position.count, nb = b.toNonIndexed().attributes.position.count;
    const { geo, edges } = coloredPart([{ g: a, c: new Color('#ff0000') }, { g: b, c: new Color('#0000ff') }]);
    expect(geo.index).toBeNull();
    expect(geo.attributes.uv).toBeUndefined();
    expect(geo.attributes.position.count).toBe(na + nb);
    expect(edges.attributes.position.count).toBeGreaterThan(0);
    expect(geo.attributes.color.getX(0)).toBeCloseTo(new Color('#ff0000').r, 6);
    expect(geo.attributes.color.getZ(na)).toBeCloseTo(new Color('#0000ff').b, 6);
  });
  it('refuse de fusionner des morceaux aux attributs incompatibles', () => {
    const bare = new BufferGeometry().setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3)); // sans normales, contrairement à une boîte
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {}), err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try { expect(() => mergeColored([{ g: bare, c: new Color('#fff') }, { g: new BoxGeometry(), c: new Color('#fff') }])).toThrow(/fusion impossible/); } finally { warn.mockRestore(); err.mockRestore(); }
  });
  it('emptyEdges ne trace rien', () => { expect(emptyEdges().attributes.position.count).toBe(0); });
});

describe('CameraShooter : branches de la prise de vue', () => {
  /** Contexte 2D doublé qui garde l'image posée (putImageData). */
  function setup(opts: { noContext?: boolean; fill?: (px: Uint8Array, w: number, h: number) => void } = {}) {
    const drawn: { data: Uint8ClampedArray | null } = { data: null };
    const ctx = { createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: (img: { data: Uint8ClampedArray }) => { drawn.data = new Uint8ClampedArray(img.data); }, fillRect: () => {}, fillText: vi.fn(), font: '', fillStyle: '' };
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => (opts.noContext ? null : ctx), toDataURL: () => 'data:image/jpeg;base64,xx' }) });
    const scene = new Scene(), board = new Mesh(new BoxGeometry());
    scene.add(board);
    const seen: { bg: unknown; ambient: number; sun: number }[] = [];
    const lights = { ambient: new AmbientLight('#ffffff', 1.1), sun: new DirectionalLight('#ffffff', 1.8) };
    const renderer: ShotRenderer = {
      getRenderTarget: () => null, setRenderTarget: () => {},
      render: () => { seen.push({ bg: scene.background, ambient: lights.ambient.intensity, sun: lights.sun.intensity }); },
      readRenderTargetPixels: (_t, _x, _y, w, h, buf) => { (opts.fill ?? ((p) => { p.fill(0); }))(buf as Uint8Array, w, h); },
    };
    const shooter = new CameraShooter(scene, renderer, []);
    return { scene, board, shooter, drawn, seen, lights, ctx };
  }
  beforeEach(() => { vi.unstubAllGlobals(); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('sans contexte 2D la prise de vue rend null (et la vue est quand même rétablie)', () => {
    const { shooter, board } = setup({ noContext: true });
    expect(shooter.shoot(board, 'x')).toBeNull();
    expect(board.visible).toBe(true);
  });
  it("retourne l'image à l'endroit : la lecture WebGL commence par le bas", () => {
    const { shooter, board, drawn } = setup({ fill: (px, w, h) => { for (let y = 0; y < h; y++) px.fill(10 * (y + 1), y * w * 4, (y + 1) * w * 4); } });
    expect(shooter.shoot(board, 'x', { w: 1, h: 2 })).toBe('data:image/jpeg;base64,xx');
    expect([...drawn.data!]).toEqual([20, 20, 20, 20, 10, 10, 10, 10]); // ligne du bas lue en premier, écrite en dernier
  });
  it('niveaux de gris : R = V = B = 0,3 R + 0,59 V + 0,11 B', () => {
    const { shooter, board, drawn } = setup({ fill: (px) => { px.set([200, 100, 50, 255]); } });
    shooter.shoot(board, 'x', { w: 1, h: 1, gray: true });
    const [r, g, b] = drawn.data!;
    expect(r).toBe(g); expect(g).toBe(b);
    expect(Math.abs(r - (0.3 * 200 + 0.59 * 100 + 0.11 * 50))).toBeLessThanOrEqual(0.5);
  });
  it('sans option les couleurs sont gardées telles quelles', () => {
    const { shooter, board, drawn } = setup({ fill: (px) => { px.set([200, 100, 50, 255]); } });
    shooter.shoot(board, 'x', { w: 1, h: 1 });
    expect([...drawn.data!]).toEqual([200, 100, 50, 255]);
  });
  it("de nuit le grain vaut la moitié de l'amplitude : plus fort avec les LED infrarouges", () => {
    vi.spyOn(Math, 'random').mockReturnValue(1); // (1 − 0,5) × amplitude
    const fill = (px: Uint8Array) => { px.set([100, 100, 100, 255]); };
    const a = setup({ fill }); a.shooter.shoot(a.board, 'x', { w: 1, h: 1, night: true });
    expect([...a.drawn.data!].slice(0, 3)).toEqual(Array(3).fill(100 + CAMERA_SHOT.grain / 2));
    const b = setup({ fill }); b.shooter.shoot(b.board, 'x', { w: 1, h: 1, night: true, ir: true });
    expect([...b.drawn.data!].slice(0, 3)).toEqual(Array(3).fill(100 + CAMERA_SHOT.grainIr / 2));
  });
  it("la nuit met l'ambiance nocturne pendant le rendu seulement, puis rétablit le jour", () => {
    const { shooter, board, scene, lights, seen } = setup();
    shooter.lights = lights;
    scene.background = new Color(AMBIENCE.day.background);
    shooter.shoot(board, 'x', { night: true });
    expect(seen[0].ambient).toBe(AMBIENCE.night.ambientI);
    expect(seen[0].sun).toBe(AMBIENCE.night.sunI);
    expect((seen[0].bg as Color).getHexString()).toBe(new Color(AMBIENCE.night.background).getHexString());
    expect(lights.ambient.intensity).toBe(1.1); expect(lights.sun.intensity).toBe(1.8);
    expect((scene.background as Color).getHexString()).toBe(new Color(AMBIENCE.day.background).getHexString());
    expect(lights.ambient.color.getHexString()).toBe('ffffff');
  });
  it("de jour (même avec les lumières branchées) l'ambiance n'est pas touchée", () => {
    const { shooter, board, lights, seen } = setup();
    shooter.lights = lights;
    shooter.shoot(board, 'x');
    expect(seen[0]).toMatchObject({ ambient: 1.1, sun: 1.8 });
  });
  it('suspend les faisceaux infrarouges pendant la prise et les rend après', () => {
    const { shooter, board, seen } = setup();
    const order: string[] = [];
    shooter.beams = { suspend: () => { order.push('suspend'); return () => { order.push('resume'); }; } };
    const push = seen.push.bind(seen); seen.push = (...a) => { order.push('render'); return push(...a); };
    shooter.shoot(board, 'x');
    expect(order).toEqual(['suspend', 'render', 'resume']);
  });
  it("change de taille : l'ancien render target est libéré ; même taille : il est réutilisé", () => {
    const dispose = vi.spyOn(WebGLRenderTarget.prototype, 'dispose');
    const { shooter, board } = setup();
    shooter.shoot(board, 'x', { w: 4, h: 4 });
    shooter.shoot(board, 'x', { w: 4, h: 4 });
    expect(dispose).toHaveBeenCalledTimes(0);
    shooter.shoot(board, 'x', { w: 8, h: 4 });
    expect(dispose).toHaveBeenCalledTimes(1);
    shooter.dispose();
    expect(dispose).toHaveBeenCalledTimes(2);
  });
  it('dispose sans aucune prise de vue ne plante pas et retire la lampe', () => {
    const { shooter, scene } = setup();
    shooter.dispose();
    expect(scene.children.some((o) => o.type === 'PointLight')).toBe(false);
  });
});
