// Fabriques de pièces (sans WebGL) : vérifications STRUCTURELLES (boîte englobante, attributs, couleurs de la palette), pas de golden.
import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, BufferGeometry, Color, LineSegments, Mesh } from 'three';
import type { Plank } from '@/birdhouse/model';
import { PALETTE } from '@/birdhouse/three/registry/palette';
import { conduitGeometry, ribbonGeometry, wireGeometry } from '@/birdhouse/three/factories/wire';
import { blockGeometry } from '@/birdhouse/three/factories/part/blockBox';
import { shapedBlockGeometry } from '@/birdhouse/three/factories/part/blockShaped';
import { driverGeometry } from '@/birdhouse/three/factories/part/driver';
import { fanGeometry } from '@/birdhouse/three/factories/part/fan';
import { simplePiGeometry, piGeometry } from '@/birdhouse/three/factories/part/pi';
import { solarGeometry } from '@/birdhouse/three/factories/part/solar';
import { cameraBoardGeometry } from '@/birdhouse/three/factories/part/camera';
import { partGeometry } from '@/birdhouse/three/factories/part';
import { createPlankMesh, isRawWood, plankGeometry, plankShapeKey } from '@/birdhouse/three/factories/plank';

const P = (over: Partial<Plank>): Plank => ({ id: 'p', name: 'p', w: 10, h: 20, pos: [0, 0, 0], rot: [0, 0, 0], notches: [], holes: [], ...over });
/** Dimensions (x, y, z) de la boîte englobante. */
const size = (g: BufferGeometry): [number, number, number] => { g.computeBoundingBox(); const b = g.boundingBox!; return [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z]; };
const near = (a: number[], b: number[], d = 4) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], d));
/** Couleur (espace de travail) du premier sommet. */
const color0 = (g: BufferGeometry, i = 0): [number, number, number] => [g.attributes.color.getX(i), g.attributes.color.getY(i), g.attributes.color.getZ(i)];
const rgb = (hex: string): [number, number, number] => { const c = new Color(hex); return [c.r, c.g, c.b]; };
const hasColor = (g: BufferGeometry, hex: string) => { const e = rgb(hex); for (let i = 0; i < g.attributes.color.count; i++) { const c = color0(g, i); if (Math.abs(c[0] - e[0]) + Math.abs(c[1] - e[1]) + Math.abs(c[2] - e[2]) < 1e-5) return true; } return false; };

describe('pavés (blockGeometry, shapedBlockGeometry)', () => {
  it("blockGeometry : épaisseur = p.depth, sinon celle du bois ; couleur = p.color, sinon l'isolant", () => {
    near(size(blockGeometry(P({ w: 30, h: 40, depth: 7 }), 3).geo), [30, 40, 7]);
    const d = blockGeometry(P({ w: 30, h: 40 }), 3);
    near(size(d.geo), [30, 40, 3]);
    near(color0(d.geo), rgb(PALETTE.insulation));
    near(color0(blockGeometry(P({ color: '#ff0000' }), 3).geo), rgb('#ff0000'));
    expect(d.edges.attributes.position.count).toBeGreaterThan(0);
  });
  it("shapedBlockGeometry : rectangle par défaut, épaisseur p.depth ou celle du bois, couleur bois par défaut", () => {
    const a = shapedBlockGeometry(P({ w: 30, h: 40, depth: 9 }), 3);
    near(size(a.geo), [30, 40, 9]);
    const b = shapedBlockGeometry(P({ w: 30, h: 40 }), 3);
    near(size(b.geo), [30, 40, 3]);
    near(color0(b.geo), rgb(PALETTE.woodBlock));
    near(color0(shapedBlockGeometry(P({ color: '#00ff00' }), 3).geo), rgb('#00ff00'));
  });
  it('shapedBlockGeometry : un contour libre remplace le rectangle', () => {
    const tri = shapedBlockGeometry(P({ poly: [[0, 0], [10, 0], [0, 6]], depth: 4 }), 3);
    near(size(tri.geo), [10, 6, 4]);
  });
  it("shapedBlockGeometry : un trou ne change pas l'encombrement mais ajoute des sommets", () => {
    const full = shapedBlockGeometry(P({ w: 30, h: 40, depth: 9 }), 3), holed = shapedBlockGeometry(P({ w: 30, h: 40, depth: 9, holes: [{ id: 'h', shape: 'round', x: 0, y: 0, size: 10 }] }), 3);
    near(size(holed.geo), [30, 40, 9]);
    expect(holed.geo.attributes.position.count).toBeGreaterThan(full.geo.attributes.position.count);
  });
});

describe('fils, gaine et nappe', () => {
  const path: [number, number, number][] = [[0, 0, 0], [50, 0, 0], [50, 50, 0], [50, 50, 50]];
  it('wireGeometry : un tube autour du chemin (diamètre w), couleur p.color sinon ardoise, sans arêtes', () => {
    const a = wireGeometry(P({ w: 4, path, color: '#ff0000' }));
    near(color0(a.geo), rgb('#ff0000'));
    expect(a.edges.attributes.position.count).toBe(0);
    const [sx, sy, sz] = size(a.geo);
    expect(sx).toBeGreaterThan(50 - 1); expect(sy).toBeGreaterThan(50 - 1); expect(sz).toBeGreaterThan(50 - 1);
    expect(sx).toBeLessThan(50 + 5); // le tube dépasse le chemin d'au plus son rayon + l'arrondi
    near(color0(wireGeometry(P({ w: 4, path })).geo), rgb(PALETTE.slate));
  });
  it('wireGeometry : un segment double (deux points confondus) est ignoré sans produire de NaN', () => {
    const g = wireGeometry(P({ w: 2, path: [[0, 0, 0], [30, 0, 0], [30, 0, 0], [30, 30, 0]] })).geo;
    for (const v of g.attributes.position.array) expect(Number.isFinite(v)).toBe(true);
  });
  it('wireGeometry : un chemin de deux points reste droit (pas de coude à arrondir)', () => {
    const [sx, sy] = size(wireGeometry(P({ w: 2, path: [[0, 0, 0], [40, 0, 0]] })).geo);
    expect(sx).toBeGreaterThan(39); expect(sy).toBeCloseTo(2, 1);
  });
  it('conduitGeometry : un tube annelé (rayon ondulé de ± 8 %), noir par défaut', () => {
    const p = P({ w: 16, path: [[0, 0, 0], [0, 0, 60]] }), c = conduitGeometry(p);
    near(color0(c.geo), rgb(PALETTE.conduit));
    near(color0(conduitGeometry(P({ w: 16, path: [[0, 0, 0], [0, 0, 60]], color: '#123456' })).geo), rgb('#123456'));
    const radii = new Set<number>(), pos = c.geo.attributes.position;
    for (let i = 0; i < pos.count; i++) radii.add(Math.round(Math.hypot(pos.getX(i), pos.getY(i)) * 100));
    const rs = [...radii]; expect(Math.min(...rs) / 100).toBeCloseTo(8 * 0.92, 0); expect(Math.max(...rs) / 100).toBeCloseTo(8 * 1.08, 0);
    expect(c.edges.attributes.position.count).toBe(0);
  });
  it('les fabriques de fil, de gaine et de nappe supposent un chemin : sans chemin elles échouent (pas de géométrie silencieusement vide)', () => {
    expect(() => wireGeometry(P({ w: 2 }))).toThrow();
    expect(() => conduitGeometry(P({ w: 2 }))).toThrow();
    expect(() => ribbonGeometry(P({ w: 16 }))).toThrow();
  });
  it('ribbonGeometry : ruban de largeur w, embouts de couleur différente aux deux bouts, 121 × 2 sommets', () => {
    const r = ribbonGeometry(P({ w: 16, path: [[0, 0, 0], [0, 0, 30], [40, 0, 30], [40, 0, 0]] }));
    expect(r.geo.attributes.position.count).toBe(242);
    expect(r.geo.index!.count).toBe(120 * 6);
    const first = color0(r.geo, 0), mid = color0(r.geo, 120), last = color0(r.geo, 240);
    near(first, rgb(PALETTE.ribbonTip)); near(last, rgb(PALETTE.ribbonTip)); near(mid, rgb(PALETTE.ribbon));
    expect(r.edges.attributes.position.count).toBe(0);
    // largeur du ruban au milieu : distance entre les deux bords d'une même section
    const pos = r.geo.attributes.position, w = Math.hypot(pos.getX(120) - pos.getX(121), pos.getY(120) - pos.getY(121), pos.getZ(120) - pos.getZ(121));
    expect(w).toBeCloseTo(16, 4);
  });
  it('ribbonGeometry : une nappe qui arrive à la verticale (largeur indéterminée) ne produit pas de NaN', () => {
    const r = ribbonGeometry(P({ w: 10, path: [[0, 0, 0], [0, 0, 40]] }));
    for (const v of r.geo.attributes.position.array) expect(Number.isFinite(v)).toBe(true);
  });
  it("ribbonGeometry : une arrivée dont la largeur est du mauvais côté est retournée (la largeur finale est horizontale dans les deux cas)", () => {
    for (const path of [[[0, 0, 0], [30, 0, 0], [60, 20, 0]], [[60, 20, 0], [30, 0, 0], [0, 0, 0]], [[0, 0, 0], [0, 30, 0], [0, 60, 25]]] as [number, number, number][][]) {
      const g = ribbonGeometry(P({ w: 10, path })).geo, pos = g.attributes.position, n = pos.count / 2 - 1;
      expect(Math.abs(pos.getZ(2 * n) - pos.getZ(2 * n + 1))).toBeLessThan(1e-4); // les deux bords du bout sont à la même hauteur
    }
  });
});

describe('driver, ventilateur, panneau solaire', () => {
  it("driverGeometry : carte de la couleur p.color sinon rouge, composants de la palette, épaisseur depth ou 20 par défaut", () => {
    const a = driverGeometry(P({ w: 40, h: 30, depth: 30 })), b = driverGeometry(P({ w: 40, h: 30, color: '#00ff88' }));
    expect(hasColor(a.geo, PALETTE.driverRed)).toBe(true);
    expect(hasColor(a.geo, PALETTE.terminalBlue)).toBe(true);
    expect(hasColor(a.geo, PALETTE.ledGreen)).toBe(true);
    expect(hasColor(b.geo, '#00ff88')).toBe(true); expect(hasColor(b.geo, PALETTE.driverRed)).toBe(false);
    // la carte est collée au bas de l'épaisseur : le dessous est à −depth/2
    a.geo.computeBoundingBox(); b.geo.computeBoundingBox();
    expect(a.geo.boundingBox!.min.z).toBeCloseTo(-15, 5);
    expect(b.geo.boundingBox!.min.z).toBeCloseTo(-10, 5);
  });
  it("fanGeometry : cadre percé + rotor à part, profondeur depth ou 25 ; couleur du cadre p.color sinon ardoise", () => {
    const a = fanGeometry(P({ w: 60, h: 60 })), b = fanGeometry(P({ w: 60, h: 60, depth: 40, color: '#8b5a2b' }));
    near(size(a.geo), [60, 60, 25]); near(size(b.geo), [60, 60, 40]);
    expect(hasColor(a.geo, PALETTE.slate)).toBe(true);
    expect(hasColor(b.geo, '#8b5a2b')).toBe(true);
    expect(a.rotor).toBeDefined();
    expect(hasColor(a.rotor!.geo, PALETTE.lightGray)).toBe(true); // pales
    expect(hasColor(a.rotor!.geo, PALETTE.slate600)).toBe(true); // moyeu
    const [rx, ry] = size(a.rotor!.geo);
    expect(rx).toBeLessThan(60 * 0.46 * 2 + 1); expect(ry).toBeLessThan(60 * 0.46 * 2 + 1); // le rotor tient dans l'alésage
  });
  it("solarGeometry : encombrement W × H × (depth ou 35) plus les rails et la boîte de jonction au dos ; palette du panneau", () => {
    const a = solarGeometry(P({ w: 1000, h: 600 })), b = solarGeometry(P({ w: 1000, h: 600, depth: 50 }));
    const sa = size(a.geo), sb = size(b.geo);
    expect(sa[0]).toBeCloseTo(1000, 3); expect(sa[1]).toBeCloseTo(600, 3);
    expect(sa[2]).toBeCloseTo(35 + 26, 3); // 35 de cadre + la boîte de jonction de 26 au dos
    expect(sb[2]).toBeCloseTo(50 + 26, 3);
    for (const c of [PALETTE.aluminiumFrame, PALETTE.solarGlass, PALETTE.solarCell, PALETTE.solarBusbar, PALETTE.steel, PALETTE.nearBlack]) expect(hasColor(a.geo, c)).toBe(true);
    expect(a.edges.attributes.position.count).toBe(0);
  });
});

describe('Raspberry Pi : dessin de repli', () => {
  it('simplePiGeometry : carte 85 × 56 verte, composants argent / noir / or (40 broches)', () => {
    const pi = simplePiGeometry(P({ w: 85, h: 56 }));
    const [sx, sy] = size(pi.geo);
    expect(sx).toBeGreaterThanOrEqual(85); expect(sx).toBeLessThan(89); expect(sy).toBeGreaterThanOrEqual(56); expect(sy).toBeLessThan(58); // la carte + le bloc Ethernet qui dépasse de 3 mm
    for (const c of [PALETTE.piGreen, PALETTE.silver, PALETTE.nearBlack, PALETTE.gold, PALETTE.offWhite]) expect(hasColor(pi.geo, c)).toBe(true);
    expect(pi.edges.attributes.position.count).toBeGreaterThan(0);
  });
  it("piGeometry sans modèle chargé retombe sur le dessin simplifié (avec arêtes)", () => {
    const g = piGeometry(P({ w: 85, h: 56 }));
    expect(g.edges.attributes.position.count).toBeGreaterThan(0);
  });
});

describe('partGeometry : aiguillage par type', () => {
  it('un bloc plein : boîte ; un bloc percé ou à contour libre : plaque épaisse (plus de sommets)', () => {
    const plain = partGeometry(P({ special: 'block', w: 20, h: 20, depth: 10 }), 3);
    const holed = partGeometry(P({ special: 'block', w: 20, h: 20, depth: 10, holes: [{ id: 'h', shape: 'round', x: 0, y: 0, size: 6 }] }), 3);
    const poly = partGeometry(P({ special: 'block', w: 20, h: 20, depth: 10, poly: [[0, 0], [20, 0], [0, 20]] }), 3);
    expect(plain.geo.attributes.position.count).toBe(24); // 6 faces × 4 sommets (boîte indexée)
    expect(holed.geo.attributes.position.count).toBeGreaterThan(24);
    near(size(poly.geo), [20, 20, 10]);
  });
  it("une pièce sans type connu est dessinée comme une carte caméra, de même qu'un type absent de la table (doc, alu)", () => {
    const cam = cameraBoardGeometry(P({ special: 'camera' }));
    for (const special of [undefined, 'doc', 'alu'] as const) {
      const g = partGeometry(P({ special: special as Plank['special'] }), 3);
      expect(g.geo.attributes.position.count).toBe(cam.geo.attributes.position.count);
    }
  });
  it("t vaut 3 par défaut : un pavé sans depth fait 3 d'épaisseur", () => {
    near(size(partGeometry(P({ special: 'block', w: 5, h: 5 })).geo), [5, 5, 3]);
  });
  it("les types de la table donnent les mêmes sommets que leur fabrique", () => {
    expect(partGeometry(P({ special: 'solar', w: 100, h: 60 }), 3).geo.attributes.position.count).toBe(solarGeometry(P({ w: 100, h: 60 })).geo.attributes.position.count);
    expect(partGeometry(P({ special: 'fan', w: 60, h: 60 }), 3).rotor).toBeDefined();
    expect(partGeometry(P({ special: 'driver', w: 40, h: 30 }), 3).geo.attributes.color).toBeDefined();
    expect(partGeometry(P({ special: 'wire', w: 2, path: [[0, 0, 0], [10, 0, 0]] }), 3).geo.attributes.color).toBeDefined();
  });
});

describe('cure-dent', () => {
  it('un cylindre de diamètre w et de longueur depth le long de z (pas une boîte)', () => {
    const g = partGeometry(P({ special: 'pin', w: 2, h: 2, depth: 10, color: '#d9b779' }), 3).geo;
    g.computeBoundingBox();
    const b = g.boundingBox!;
    expect(b.max.x - b.min.x).toBeCloseTo(2, 5);
    expect(b.max.y - b.min.y).toBeCloseTo(2, 5);
    expect(b.max.z - b.min.z).toBeCloseTo(10, 5);
    expect(g.attributes.position.count).toBeGreaterThan(24); // une boîte n'en a que 24
    expect(g.attributes.color).toBeDefined();
  });
});

describe('plankGeometry / PlankMesh', () => {
  it("MDF : dessus, dessous et tranche aux couleurs MDF, distinctes du contreplaqué", () => {
    const ply = plankGeometry(P({ w: 20, h: 20 }), 3).geo, mdf = plankGeometry(P({ w: 20, h: 20, material: 'mdf' }), 3).geo;
    for (const [hex, g] of [[PALETTE.oiledTop, ply], [PALETTE.oiledBottom, ply], [PALETTE.oiledSide, ply], [PALETTE.mdfTop, mdf], [PALETTE.mdfBottom, mdf], [PALETTE.mdfSide, mdf]] as const) expect(hasColor(g, hex)).toBe(true);
    expect(hasColor(mdf, PALETTE.oiledTop)).toBe(false);
  });
  it("huilé / brut : seul l'intérieur du nid (parois intérieures, plancher intérieur, bloc d'entrée) est brut, tout le reste du contreplaqué est huilé", () => {
    const raw = plankGeometry(P({ w: 20, h: 20, name: 'Plancher int' }), 3).geo, oiled = plankGeometry(P({ w: 20, h: 20, name: 'Dessous ext' }), 3).geo;
    for (const hex of [PALETTE.plywoodTop, PALETTE.plywoodBottom, PALETTE.plywoodSide]) { expect(hasColor(raw, hex)).toBe(true); expect(hasColor(oiled, hex)).toBe(false); }
    for (const hex of [PALETTE.oiledTop, PALETTE.oiledBottom, PALETTE.oiledSide]) { expect(hasColor(oiled, hex)).toBe(true); expect(hasColor(raw, hex)).toBe(false); }
    for (const n of ['Face avant int', 'Côté gauche int', 'Entrée 3']) expect(isRawWood(P({ name: n })), n).toBe(true);
    for (const n of ['Face avant ext', 'Plancher', 'Entrée']) expect(isRawWood(P({ name: n })), n).toBe(false);
    expect(isRawWood(P({ name: 'Plancher int', special: 'block' }))).toBe(false);
  });
  it("les trous ajoutent des arêtes ; les trous ronds n'ont pas de verticales (seuls les contours à angles en ont)", () => {
    const plain = plankGeometry(P({ w: 20, h: 20 }), 3).edges.attributes.position.count;
    const holed = plankGeometry(P({ w: 20, h: 20, holes: [{ id: 'h', shape: 'round', x: 0, y: 0, size: 6 }] }), 3).edges.attributes.position.count;
    const sq = plankGeometry(P({ w: 20, h: 20, holes: [{ id: 'h', shape: 'square', x: 0, y: 0, size: 6, sh: 6 }] }), 3).edges.attributes.position.count;
    expect(holed).toBeGreaterThan(plain);
    expect(sq).toBe(plain + 4 * 6); // carré : 4 côtés × (haut + bas + vertical) × 2 sommets
  });
  it("okoumé peint : épaisseur = depth (sinon celle de la scène), tout en color (sinon blanc)", () => {
    const size = (g: BufferGeometry) => { g.computeBoundingBox(); return g.boundingBox!.max.z - g.boundingBox!.min.z; };
    const full = plankGeometry(P({ w: 20, h: 20, material: 'okoume', depth: 5, color: '#336699' }), 3).geo, bare = plankGeometry(P({ w: 20, h: 20, material: 'okoume' }), 3).geo;
    expect(size(full)).toBeCloseTo(5, 6); expect(size(bare)).toBeCloseTo(3, 6);
    const col = (g: BufferGeometry) => [...g.attributes.color.array.slice(0, 3)];
    expect(col(full)).toEqual([...new Color('#336699').toArray()].map((x) => Math.fround(x))); expect(col(bare)).toEqual([1, 1, 1]);
  });
  it('plankShapeKey change avec chaque propriété de forme, et pas avec la position', () => {
    const base = P({}), k = plankShapeKey(base, 3);
    expect(plankShapeKey({ ...base, pos: [5, 5, 5], rot: [1, 2, 3] }, 3)).toBe(k);
    for (const o of [{ w: 11 }, { h: 21 }, { depth: 3 }, { color: '#fff' }, { material: 'mdf' as const }, { special: 'bar' as const }, { poly: [[0, 0], [1, 0], [0, 1]] as [number, number][] }]) expect(plankShapeKey({ ...base, ...o }, 3)).not.toBe(k);
    expect(plankShapeKey(base, 4)).not.toBe(k);
  });
  it("le rotor : créé avec le ventilateur, remplacé en gardant la même mesh (ancienne géométrie libérée), retiré quand la plaque n'est plus un ventilateur", () => {
    const fan = P({ special: 'fan', w: 60, h: 60 });
    const m = createPlankMesh(fan, 3), rotor = m.rotor!;
    expect(rotor).toBeInstanceOf(Mesh);
    const oldGeo = rotor.geometry, oldEdges = (rotor.children[0] as LineSegments).geometry;
    const d1 = vi.fn(), d2 = vi.fn(); oldGeo.addEventListener('dispose', d1); oldEdges.addEventListener('dispose', d2);
    m.updateShape({ ...fan, w: 70, h: 70 }, 3);
    expect(m.rotor).toBe(rotor); // même mesh, angle courant gardé
    expect(rotor.geometry).not.toBe(oldGeo);
    expect(d1).toHaveBeenCalledTimes(1); expect(d2).toHaveBeenCalledTimes(1);
    const d3 = vi.fn(); rotor.geometry.addEventListener('dispose', d3);
    m.updateShape(P({ w: 70, h: 70 }), 3);
    expect(m.rotor).toBeNull();
    expect(rotor.parent).toBeNull();
    expect(d3).toHaveBeenCalledTimes(1);
    m.updateShape(P({ w: 71, h: 70 }), 3); // sans rotor : rien à retirer
    expect(m.rotor).toBeNull();
  });
  it("updateShape ne refait rien si la clé de forme n'a pas changé", () => {
    const m = createPlankMesh(P({}), 3), geo = m.geometry;
    m.updateShape(P({ pos: [9, 9, 9] }), 3);
    expect(m.geometry).toBe(geo);
  });
  it("une plaque spéciale passe par partGeometry (pas de contour de bois)", () => {
    const g = plankGeometry(P({ special: 'block', w: 8, h: 8, depth: 4 }), 3);
    near(size(g.geo), [8, 8, 4]);
    expect(new BoxGeometry().attributes.position.count).toBeGreaterThan(0);
  });
});
