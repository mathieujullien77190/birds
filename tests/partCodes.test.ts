// Codes des plaques découpées (T01…), police de gravure, emplacement libre du texte, gravure sur les planches (SVG → laser-control) : fonctions pures, sans WebGL.
import { describe, expect, it } from 'vitest';
import {
  CODE_MARGIN, FONT, NEST_DEFAULT, categoryPrefixes, codeOutlines, codeSpot, holeOutline, isLaserPlank, letters, makeNest, nestSheets, outline, partTable, plankCodes, plankSignature,
  sheetSvg, sheetsPreviewSvg, textContours, textWidth, TEXT_HEIGHT, type Hole, type Plank, type PlankScene, type Pt,
} from '@/birdhouse/model';
import { sheetToJob } from '@/features/laser/adapter';
import { parseSvg } from '../laser-control/src/job/svg';

let n = 0;
const P = (name: string, group: string | undefined, over: Partial<Plank> = {}): Plank => ({ id: `p${++n}`, name, group, w: 100, h: 50, pos: [0, 0, 0], rot: [0, 0, 0], notches: [], holes: [], ...over });
const S = (planks: Plank[], groupNames: Record<string, string> = { T: 'Toit', H: 'Habillage', E1: 'Électronique', E2: 'Entrée', C1: 'Corps', C2: 'Couvercle' }): PlankScene => ({ t: 3, fit: 0, planks, groupNames, up: 'z2' });
const hole = (x: number, y: number, size: number, over: Partial<Hole> = {}): Hole => ({ id: `h${++n}`, shape: 'round', x, y, size, ...over });

describe('préfixe de catégorie', () => {
  it('première lettre du nom du groupe, sans accent, en majuscule', () => {
    expect(letters('Électronique')).toBe('ELECTRONIQUE');
    expect(categoryPrefixes(['Toit', 'Habillage', 'Ventilation', 'Électronique'])).toEqual(new Map([['Toit', 'T'], ['Habillage', 'H'], ['Ventilation', 'V'], ['Électronique', 'E']]));
  });
  it('même première lettre : tous prennent le plus court préfixe qui les distingue (EL / EN, COR / COU)', () => {
    expect(categoryPrefixes(['Électronique', 'Entrée'])).toEqual(new Map([['Électronique', 'EL'], ['Entrée', 'EN']]));
    expect(categoryPrefixes(['Corps', 'Couvercle', 'Toit'])).toEqual(new Map([['Corps', 'COR'], ['Couvercle', 'COU'], ['Toit', 'T']]));
  });
  it("l'un est le début de l'autre : le préfixe s'allonge jusqu'à les distinguer", () => {
    expect(categoryPrefixes(['Toit', 'Toiture'])).toEqual(new Map([['Toit', 'TOIT'], ['Toiture', 'TOITU']]));
  });
  it('mêmes lettres sous deux noms (casse, ponctuation) : un chiffre départage', () => {
    expect(categoryPrefixes(['Toit', 'TOIT!'])).toEqual(new Map([['Toit', 'TOIT'], ['TOIT!', 'TOIT2']]));
  });
  it('sans lettre (ou sans groupe) : X', () => {
    expect(categoryPrefixes([''])).toEqual(new Map([['', 'X']]));
    expect(categoryPrefixes(['', '12'])).toEqual(new Map([['', 'X'], ['12', 'X2']]));
  });
});

describe('plankCodes', () => {
  it('lettre du groupe + numéro à deux chiffres, dans l’ordre d’apparition', () => {
    const planks = [P('a', 'T'), P('b', 'T', { w: 90 }), P('c', 'H'), P('d', 'T', { w: 80 })];
    const c = plankCodes(S(planks));
    expect(planks.map((p) => c.get(p.id))).toEqual(['T-01', 'T-02', 'H-01', 'T-03']);
  });
  it('deux pièces strictement identiques portent le même numéro', () => {
    const planks = [P('Étrier 1', 'C1'), P('Étrier 2', 'C1'), P('Autre', 'C1', { h: 51 }), P('Étrier 3', 'C1')];
    const c = plankCodes(S(planks));
    expect(planks.map((p) => c.get(p.id))).toEqual(['C-01', 'C-01', 'C-02', 'C-01']);
  });
  it('mêmes dimensions mais pas le même contour, trous, crans ou matériau : numéros différents', () => {
    const variants = [
      P('b', 'T'),
      P('poly', 'T', { poly: [[-50, -25], [50, -25], [50, 25], [-50, 25]] }),
      P('trou', 'T', { holes: [hole(0, 0, 10)] }),
      P('trou2', 'T', { holes: [hole(1, 0, 10)] }),
      P('carré', 'T', { holes: [hole(0, 0, 10, { shape: 'square', sh: 4, r: 1 })] }),
      P('fente', 'T', { holes: [hole(0, 0, 10, { poly: [[0, 0], [5, 0], [5, 5]] })] }),
      P('cran', 'T', { notches: [{ id: 'n', edge: 'top', pos: 10, width: 6, depth: 3 }] }),
      P('cran2', 'T', { notches: [{ id: 'n', edge: 'top', pos: 11, width: 6, depth: 3 }] }),
      P('mdf', 'T', { material: 'mdf' }),
      P('okoume', 'T', { material: 'okoume', depth: 5 }),
      P('okoume6', 'T', { material: 'okoume', depth: 6 }),
      P('okoume sans épaisseur', 'T', { material: 'okoume' }),
    ];
    const c = plankCodes(S(variants));
    expect(new Set(variants.map((p) => c.get(p.id))).size).toBe(variants.length);
  });
  it("un contour en miroir n'est PAS identique", () => {
    const a = P('a', 'T', { poly: [[-50, -25], [50, -25], [50, 25], [-20, 25]] }), b = P('b', 'T', { poly: [[-50, -25], [50, -25], [20, 25], [-50, 25]] });
    const c = plankCodes(S([a, b]));
    expect(c.get(a.id)).not.toBe(c.get(b.id));
  });
  it("l'ordre des trous ou des crans, le nom, l'identifiant et la position ne changent pas l'empreinte", () => {
    const h1 = hole(10, 0, 5), h2 = hole(-10, 0, 8);
    const nn = (pos: number) => ({ id: `n${pos}`, edge: 'left' as const, pos, width: 4, depth: 2 });
    const a = P('a', 'T', { holes: [h1, h2], notches: [nn(5), nn(20)] }), b = P('zzz', 'T', { holes: [h2, h1], notches: [nn(20), nn(5)], pos: [9, 9, 9] });
    expect(plankSignature(a, 3)).toBe(plankSignature(b, 3));
  });
  it('les pièces non découpées (spécial) n’ont pas de code ; sans groupe : X', () => {
    const planks = [P('Pi', 'T', { special: 'pi' }), P('bloc', 'T', { special: 'block' }), P('seule', undefined), P('hors table', 'inconnu')];
    const c = plankCodes(S(planks));
    expect([...c.keys()]).toEqual([planks[2].id, planks[3].id]);
    expect([c.get(planks[2].id), c.get(planks[3].id)]).toEqual(['X-01', 'X-01']); // sans groupe et groupe inconnu : même catégorie « sans nom »
    expect(planks.map(isLaserPlank)).toEqual([false, false, true, true]);
    expect(plankCodes({ t: 3, fit: 0, planks: [P('s', undefined)], up: 'z2' }).size).toBe(1); // scène sans noms de groupes
  });
  it('déterministe, et réordonner les groupes ne mélange pas les numéros d’un groupe', () => {
    const planks = [P('a', 'T'), P('b', 'T', { w: 90 }), P('c', 'H')];
    expect(plankCodes(S(planks))).toEqual(plankCodes(S(planks)));
    const c2 = plankCodes(S([planks[2], planks[0], planks[1]]));
    expect([c2.get(planks[0].id), c2.get(planks[1].id), c2.get(planks[2].id)]).toEqual(['T-01', 'T-02', 'H-01']);
  });
  it('au-delà de 99 formes d’une catégorie : trois chiffres', () => {
    const planks = Array.from({ length: 101 }, (_, i) => P(`p${i}`, 'T', { w: 10 + i }));
    expect(plankCodes(S(planks)).get(planks[100].id)).toBe('T-101');
  });
});

describe('partTable : liste « Plaques à découper »', () => {
  it('une ligne par code : noms, groupe, matériau, quantité', () => {
    const planks = [P('Étrier 1', 'C1'), P('Étrier 2', 'C1'), P('Étrier 1', 'C1'), P('Lame', 'H', { material: 'okoume', depth: 5 }), P('Barre', 'T', { material: 'mdf', w: 60 }), P('seule', undefined, { w: 7 }), P('Pi', 'T', { special: 'pi' })];
    expect(partTable(S(planks))).toEqual([
      { code: 'C-01', names: ['Étrier 1', 'Étrier 2'], group: 'Corps', material: 'contreplaqué', qty: 3 },
      { code: 'H-01', names: ['Lame'], group: 'Habillage', material: 'okoumé', qty: 1 },
      { code: 'T-01', names: ['Barre'], group: 'Toit', material: 'MDF', qty: 1 },
      { code: 'X-01', names: ['seule'], group: '—', material: 'contreplaqué', qty: 1 },
    ]);
  });
});

describe('police de gravure', () => {
  it('tous les chiffres et toutes les lettres existent, chaque tracé a au moins deux points sur la grille 3 × 5', () => {
    for (const ch of '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      expect(FONT[ch], ch).toBeDefined();
      for (const stroke of FONT[ch]) {
        expect(stroke.length).toBeGreaterThanOrEqual(2);
        for (const [x, y] of stroke) expect(x >= 0 && x <= 2 && y >= 0 && y <= 4, `${ch} ${x},${y}`).toBe(true);
      }
    }
  });
  it('un rectangle FERMÉ (4 points) par segment, trait de 0,6 mm, texte de 5 mm de haut', () => {
    const { contours, w, h } = textContours('T-01');
    expect(contours.every((c) => c.length === 4)).toBe(true);
    expect(contours).toHaveLength(2 + 1 + 5 + 2); // T : 2, tiret : 1, 0 barré : 4 + 1, 1 : 2
    expect(h).toBeCloseTo(TEXT_HEIGHT, 9);
    expect(TEXT_HEIGHT).toBeCloseTo(5.6, 9);
    expect(w).toBeCloseTo(textWidth(4), 9);
    const xs = contours.flat().map((p) => p[0]), ys = contours.flat().map((p) => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(0, 9);
    expect(Math.min(...ys)).toBeCloseTo(0, 9);
    expect(Math.max(...xs)).toBeLessThanOrEqual(w);
    expect(Math.max(...xs)).toBeGreaterThan(w - 1.5); // le « 1 » est plus étroit que la case
    expect(Math.max(...ys)).toBeCloseTo(h, 9);
    const first = contours[0]; // segment horizontal de la barre du T : 0,6 de large
    expect(Math.hypot(first[0][0] - first[3][0], first[0][1] - first[3][1])).toBeCloseTo(0.8, 6);
  });
  it('minuscules en majuscules, caractères inconnus laissés en blanc, échelle respectée', () => {
    expect(textContours('t').contours).toEqual(textContours('T').contours);
    expect(textContours('?').contours).toEqual([]);
    expect(textContours('?').w).toBe(textWidth(1));
    const s = textContours('A1', 0.6);
    expect(s.h).toBeCloseTo(3.36, 9);
    expect(s.w).toBeCloseTo(textWidth(2, 0.6), 9);
  });
});

const pointSeg = (p: Pt, a: Pt, b: Pt) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};
const inLoop = (loop: Pt[], [x, y]: Pt) => {
  let c = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) { const [xi, yi] = loop[i], [xj, yj] = loop[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; }
  return c;
};
/** Distance minimale du point à tous les bords d'une pièce (contour et trous) ; −1 s'il n'est pas dans la matière. */
const clearance = (poly: Pt[], holes: Pt[][], p: Pt): number => {
  if (!inLoop(poly, p) || holes.some((h) => inLoop(h, p))) return -1;
  let d = Infinity;
  for (const loop of [poly, ...holes]) for (let i = 0; i < loop.length; i++) d = Math.min(d, pointSeg(p, loop[i], loop[(i + 1) % loop.length]));
  return d;
};

describe('emplacement du code sur une plaque', () => {
  it('plaque libre : au centre, 5 mm de haut, à l’horizontale', () => {
    const s = codeSpot(P('a', 'T'), 4)!;
    expect(s).toMatchObject({ x: 0, y: 0, scale: 1, turned: false });
    expect(s.w).toBeCloseTo(textWidth(4), 9);
  });
  it('plaque basse : la hauteur du texte passe à 4 puis 3 mm', () => {
    expect(codeSpot(P('b', 'T', { w: 30, h: 7.2 }), 4)!.scale).toBe(0.8);
    expect(codeSpot(P('c', 'T', { w: 30, h: 5.8 }), 4)!.scale).toBe(0.6);
  });
  it('plaque étroite et haute : le texte est couché (lu de bas en haut)', () => {
    const s = codeSpot(P('d', 'T', { w: 8.2, h: 60 }), 4)!;
    expect(s).toMatchObject({ turned: true, scale: 1 });
    expect(s.h).toBeCloseTo(textWidth(4), 9);
    const o = codeOutlines(s, 'T-01');
    const ys = o.flat().map((p) => p[1]), xs = o.flat().map((p) => p[0]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(textWidth(4) + 1e-9);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(textWidth(4) - 1.5);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(TEXT_HEIGHT, 6);
  });
  it('trop petite (moins de 3 mm de texte avec la marge) : pas de code gravé', () => {
    expect(codeSpot(P('e', 'T', { w: 4.7, h: 40 }), 4)).toBeNull();
    expect(codeSpot(P('f', 'T', { w: 30, h: 5 }), 4)).toBeNull();
  });
  it('évite un trou central et la même plaque donne le même résultat (mémorisé)', () => {
    const p = P('g', 'T', { holes: [hole(0, 0, 30)] });
    const s = codeSpot(p, 4)!;
    expect(codeSpot(P('g2', 'T', { holes: [hole(0, 0, 30)] }), 4)).toBe(s);
    for (const c of codeOutlines(s, 'T-01')) for (const q of c) expect(clearance(outline(p), p.holes.map(holeOutline), q)).toBeGreaterThanOrEqual(CODE_MARGIN - 1e-6);
  });
  it('la mémoire se vide quand elle déborde sans casser les résultats', () => {
    const first = codeSpot(P('h', 'T', { w: 40 }), 4)!;
    for (let i = 0; i < 2100; i++) codeSpot(P('m', 'T', { w: 20 + i * 0.01, h: 9 }), 1);
    expect(codeSpot(P('h2', 'T', { w: 40 }), 4)).toEqual(first);
  });
  it('un trou carré au centre : le texte se pose à côté, jamais dessus', () => {
    const p = P('i', 'T', { w: 60, h: 30, holes: [hole(0, 0, 14, { shape: 'square', sh: 14 })] });
    const s = codeSpot(p, 4)!;
    expect(s).not.toBeNull();
    for (const c of codeOutlines(s, 'T-01')) for (const q of c) expect(clearance(outline(p), p.holes.map(holeOutline), q)).toBeGreaterThanOrEqual(1);
  });
});

describe('nichoir par défaut : tous les codes gravés', () => {
  const nest = makeNest(NEST_DEFAULT, 3, 0, 1);
  const sc: PlankScene = { t: 3, fit: 0, planks: nest.planks, groupNames: nest.groupNames, up: 'z2' };
  const sheets = nestSheets(sc, 410, 400, 5);
  const items = sheets.flatMap((s) => s.items);

  it('chaque plaque posée sur une planche a son code, celui de la scène entière (jamais celui d’un sous-ensemble par matériau)', () => {
    const codes = plankCodes(sc);
    expect(items.length).toBe(sc.planks.filter(isLaserPlank).length);
    for (const it of items) expect(it.code).toBe(codes.get(it.plank.id));
    expect(sheets.some((s) => s.material === 'okoume')).toBe(true);
    expect(items.filter((it) => /^Lambris/.test(it.plank.name)).every((it) => it.code!.startsWith('H'))).toBe(true);
  });
  it('des pièces identiques ont le même code (4 étriers du régulateur)', () => {
    const e = items.filter((it) => /^Étrier régulateur/.test(it.plank.name)).map((it) => it.code);
    expect(e).toHaveLength(4);
    expect(new Set(e).size).toBe(1);
  });
  it('le code gravé est dans la matière, à ≥ 1 mm de tout bord, dent et trou, quelle que soit la rotation de la pièce sur la planche', () => {
    let engraved = 0;
    for (const it of items) {
      if (!it.engrave) continue;
      engraved++;
      expect(it.engrave.length).toBeGreaterThan(3);
      for (const c of it.engrave) {
        expect(c).toHaveLength(4);
        for (const q of c) expect(clearance(it.poly, it.holes, q), `${it.code} ${it.plank.name}`).toBeGreaterThanOrEqual(1 - 1e-6);
      }
    }
    expect(engraved).toBeGreaterThan(100);
    // sans gravure : seulement des plaques où 3 mm de texte + marges ne tiennent pas
    for (const it of items.filter((i) => !i.engrave)) expect(Math.min(it.plank.w, it.plank.h), it.plank.name).toBeLessThan(40);
  });
  it('des pièces posées de travers (quart de tour, demi-tour) portent leur code dans leur propre sens', () => {
    expect(new Set(items.map((i) => i.turns)).size).toBeGreaterThan(1);
    for (const it of items.filter((i) => i.turns !== 0 && i.engrave)) {
      const spot = codeSpot(it.plank, it.code!.length)!;
      const xs = it.engrave!.flat().map((p) => p[0]), ys = it.engrave!.flat().map((p) => p[1]);
      const wx = Math.max(...xs) - Math.min(...xs), wy = Math.max(...ys) - Math.min(...ys);
      expect(wx > wy, it.plank.name).toBe(it.turns === 2 ? !spot.turned : spot.turned); // demi-tour : même sens ; quart de tour : le texte horizontal devient vertical
    }
  });
  it('SVG de la planche : le code est en bleu (contours fermés) ; laser-control le lit en gravure et la coupe est inchangée', () => {
    for (const [i, sh] of sheets.entries()) {
      const svg = sheetSvg(sh, 410, 400, i);
      const nGraved = sh.items.reduce((a, it) => a + (it.engrave?.length ?? 0), 0);
      expect((svg.match(/<polygon class="e"/g) ?? []).length).toBe(nGraved);
      const { job, warnings } = parseSvg(svg);
      expect(job.layers.engrave?.length ?? 0).toBe(nGraved);
      expect(warnings).toEqual([]);
      const plain = parseSvg(svg.replace(/<polygon class="e"[^>]*\/>/g, ''));
      expect(job.layers.cut).toEqual(plain.job.layers.cut);
      expect(plain.job.layers.engrave).toBeUndefined();
      const adapted = sheetToJob(sh, 410, 400);
      expect(adapted.layers.engrave?.length ?? 0).toBe(nGraved);
      expect(adapted.layers.cut).toHaveLength(job.layers.cut.length);
      for (const c of job.layers.engrave ?? []) expect(c.length).toBeGreaterThanOrEqual(3);
    }
    expect(sheetSvg(sheets[0], 410, 400, 0)).toContain('fill="none" stroke="#00f"');
    expect(sheetSvg(sheets[0], 410, 400, 0)).toMatch(/>[A-Z]+-\d\d /); // « T01 Nom » dans le texte de repère
    expect(sheetsPreviewSvg(sheets, 410, 400)).toContain('polygon.e{stroke-width:0.1}');
  });
  it('un élément sans code (planche construite à la main) s’écrit sans préfixe, sans gravure', () => {
    const it = { plank: P('Seule', 'T'), poly: [[0, 0], [10, 0], [10, 10], [0, 10]] as Pt[], holes: [], w: 10, h: 10, x: 0, y: 0, rotated: false, turns: 0 as const };
    const svg = sheetSvg({ items: [it], used: 0.1 }, 100, 100, 0);
    expect(svg).toContain('>Seule</text>');
    expect(svg).not.toContain('class="e"');
  });
  it('l’adaptateur envoie la gravure à la machine, dans le repère bas-gauche', () => {
    const sh = sheets[0], job = sheetToJob(sh, 410, 400), it = sh.items.find((i) => i.engrave)!;
    const [a, b] = it.engrave![0][0];
    expect(job.layers.engrave).toContainEqual(expect.arrayContaining([[it.x + a, 400 - (it.y + it.h - b)]]));
    expect(sheetToJob({ items: [] } as never, 410, 400).layers.engrave).toBeUndefined();
  });
  it('pièce plus grande que la planche : posée seule, son code est quand même gravé', () => {
    const big = P('Immense', 'T', { w: 500, h: 450 });
    const sh = nestSheets(S([big]), 410, 400, 5);
    expect(sh[0].items[0].code).toBe('T-01');
    expect(sh[0].items[0].engrave?.length).toBeGreaterThan(0);
  });
});
