// @vitest-environment jsdom
// SVG « une plaque » et rangement à plat (layout / planksSvg) ; boucle de rendu dans son environnement navigateur ; reconnaissance d'une mesh de plaque.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Mesh } from 'three';
import { layout, planksSvg, plankSvg, type Plank, type PlankScene } from '@/birdhouse/model';
import { startRenderLoop } from '@/birdhouse/three/scene/renderLoop';
import { createPlankMesh, isPlankMesh } from '@/birdhouse/three/factories/plank';

const plank = (id: string, w: number, h: number, over: Partial<Plank> = {}): Plank => ({ id, name: id, w, h, pos: [0, 0, 0], rot: [0, 0, 0], notches: [], holes: [], ...over });
const scene = (planks: Plank[]): PlankScene => ({ t: 3, fit: 0, planks, up: 'z2' });

describe('layout : étagères', () => {
  it('trie par hauteur décroissante, passe à la ligne quand la planche est pleine, et donne la hauteur totale', () => {
    const { placed, height } = layout(scene([plank('petite', 30, 10), plank('haute', 40, 50), plank('large', 80, 20)]), 100);
    expect(placed.map((p) => p.plank.id)).toEqual(['haute', 'large', 'petite']);
    expect(placed.map((p) => [p.x, p.y])).toEqual([[6, 6], [6, 62], [6, 88]]); // « large » (80) ne tient pas à côté de « haute » (40) dans 100 : ligne suivante ; « petite » non plus
    expect(height).toBe(88 + 10 + 6);
  });
  it('une plaque plus large que la planche reste seule sur la première ligne (jamais de ligne vide)', () => {
    const { placed } = layout(scene([plank('immense', 500, 10), plank('b', 10, 10)]), 100);
    expect(placed[0]).toMatchObject({ x: 6, y: 6 });
    expect(placed[1].y).toBe(6 + 10 + 6);
  });
  it('scène vide : hauteur de deux marges', () => {
    expect(layout(scene([]), 100)).toEqual({ placed: [], height: 12 });
  });
});

describe('planksSvg', () => {
  it('SVG à l\'échelle réelle : taille en mm, une coupe par plaque, ses trous, son nom en bleu', () => {
    const p = plank('Face', 40, 20, { holes: [{ id: 'h', shape: 'round', x: 0, y: 0, size: 10 }] });
    const svg = planksSvg(scene([p]), 100);
    expect(svg).toContain('width="100mm"');
    expect(svg).toContain('height="32mm"'); // 6 + 20 + 6
    expect(svg).toContain('viewBox="0 0 100 32"');
    expect((svg.match(/<polygon/g) ?? []).length).toBe(2); // contour + trou
    expect(svg).toContain('stroke-width="0.1"');
    expect(svg).toContain('>Face</text>');
  });
});

describe('plankSvg : une plaque dans la liste « Pièces »', () => {
  it('dimensions = (largeur + 2 × 4 mm de marge) × échelle, contour et trous en blanc', () => {
    const p = plank('Mur', 100, 50, { holes: [{ id: 'h', shape: 'square', x: 0, y: 0, size: 10, sh: 10 }] });
    const svg = plankSvg(p, 2);
    expect(svg).toContain('width="216"');
    expect(svg).toContain('height="116"');
    expect(svg).toContain('fill="#f5ead8"');
    expect(svg).toContain('fill="#fff"');
    // le coin bas-gauche de la plaque est en (marge, marge + h) × échelle : (4 + 0) * 2 = 8 ; (50/2 - (-25) + 4) * 2 = 108
    expect(svg).toContain('8,108');
    expect(plankSvg(plank('Sans trou', 10, 10), 1)).not.toContain('#fff');
  });
});

describe('boucle de rendu dans le navigateur (requestAnimationFrame et page cachée)', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it('utilise requestAnimationFrame, saute les images quand la page est cachée, annule à l\'arrêt', () => {
    const cbs: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cbs.push(cb); return cbs.length; });
    const cancel = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancel);
    let hidden = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const step = vi.fn();
    const stop = startRenderLoop(step);
    expect(step).toHaveBeenCalledTimes(1);
    hidden = true;
    cbs[0](0);
    expect(step).toHaveBeenCalledTimes(1); // page cachée : pas de rendu, mais la boucle continue
    expect(cbs).toHaveLength(2);
    stop();
    expect(cancel).toHaveBeenCalledWith(2);
  });
});

describe('isPlankMesh', () => {
  it('vrai pour une mesh de plaque, faux pour une autre mesh, null et undefined', () => {
    expect(isPlankMesh(createPlankMesh(plank('a', 20, 10), 3))).toBe(true);
    expect(isPlankMesh(new Mesh())).toBe(false);
    expect(isPlankMesh(null)).toBe(false);
    expect(isPlankMesh(undefined)).toBe(false);
  });
});

describe('nestSheets : pièce creuse plus grande que la planche', () => {
  it('une grande pièce percée qui ne rentre nulle part n\'est pas rangée dans le creux, et ne plante pas', async () => {
    const { nestSheets } = await import('@/birdhouse/model');
    const big = plank('Cadre', 300, 300, { holes: [{ id: 'h', shape: 'square', x: 0, y: 0, size: 200, sh: 200 }] });
    const sheets = nestSheets(scene([big, plank('petite', 20, 20)]), 100, 100);
    expect(sheets.flatMap((s) => s.items).map((i) => i.plank.id)).toContain('petite');
    for (const s of sheets) expect(s.used).toBeGreaterThan(0);
  });
});
