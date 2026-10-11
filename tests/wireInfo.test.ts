import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isWirePlank, pathLength, polylineLength, roundPoints, sectionFor, wireInfo, colorName, type Plank, type Vec3 } from '@/birdhouse/model';
import { buildNest } from './helpers';

const doc = readFileSync(new URL('../docs/schema-electronique.md', import.meta.url), 'utf8');
const branchements = doc.slice(doc.indexOf('## Branchements, fil par fil'), doc.indexOf('## Explication, bloc par bloc'));
const base = { w: 1.2, h: 1.2, pos: [0, 0, 0] as Vec3, rot: [0, 0, 0] as Vec3, notches: [], holes: [] };
const mk = (over: Partial<Plank>): Plank => ({ id: over.name ?? 'x', name: 'Fil test', ...base, special: 'wire', color: '#dc2626', path: [[0, 0, 0], [100, 0, 0]], ...over });

describe('longueur et coudes', () => {
  it('somme les segments d\'une polyligne', () => {
    expect(polylineLength([[0, 0, 0], [3, 4, 0], [3, 4, 12]])).toBe(17);
    expect(polylineLength([])).toBe(0);
  });
  it('un chemin droit garde sa longueur, un coude est raccourci par son arc', () => {
    expect(roundPoints([[0, 0, 0], [10, 0, 0]], 10)).toHaveLength(2);
    const straight = roundPoints([[0, 0, 0], [50, 0, 0], [100, 0, 0]], 10);
    expect(polylineLength(straight)).toBeCloseTo(100, 6);
    const bent = roundPoints([[0, 0, 0], [100, 0, 0], [100, 100, 0]], 10);
    expect(polylineLength(bent)).toBeLessThan(200);
    expect(polylineLength(bent)).toBeGreaterThan(190);
    expect(roundPoints([[0, 0, 0], [0, 0, 0], [10, 0, 0]], 10)).toHaveLength(2); // point doublé : coude ignoré
  });
  it('pathLength : fils arrondis, nappes en polyligne, sans chemin = 0', () => {
    const elbow: Vec3[] = [[0, 0, 0], [100, 0, 0], [100, 100, 0]];
    expect(pathLength(mk({ path: elbow }))).toBeLessThan(200);
    expect(pathLength(mk({ path: elbow, special: 'cable' }))).toBe(200);
    expect(pathLength(mk({ path: undefined }))).toBe(0);
  });
});

describe('diamètre, section, couleur', () => {
  it('section d\'après le diamètre dessiné', () => {
    expect(sectionFor(3.6)).toBe('2,5 mm²');
    expect(sectionFor(1.2)).toBe('≈ 0,25 mm²');
    expect(sectionFor(1.6)).toBe('≈ 0,25 mm²');
    expect(sectionFor(7)).toContain('4 mm²');
  });
  it('nom de couleur', () => {
    expect(colorName('#DC2626')).toBe('rouge');
    expect(colorName('#123456')).toBe('#123456');
  });
  it('isWirePlank', () => {
    expect(isWirePlank(mk({}))).toBe(true);
    expect(isWirePlank(mk({ special: 'conduit' }))).toBe(true);
    expect(isWirePlank(mk({ special: undefined }))).toBe(false);
    expect(wireInfo(mk({ special: undefined }))).toBeNull();
  });
});

describe('wireInfo sur des fils connus', () => {
  const nest = buildNest({}).planks;
  const find = (re: RegExp) => nest.find((p) => re.test(p.name))!;
  it('PWM du ventilateur : GPIO18 broche 12, Dupont 40 cm, 0,25 mm²', () => {
    const i = wireInfo(find(/^Fil PWM ventilateur/), nest)!;
    expect(i.kind).toBe('wire');
    expect(i.colorName).toBe('bleu');
    expect(i.diameter).toBe(1.2);
    expect(i.section).toBe('≈ 0,25 mm²');
    expect(i.pins).toEqual([12]);
    expect(i.from).toContain('GPIO18');
    expect(i.to).toContain('Rallonge');
    expect(i.cordCm).toBeGreaterThanOrEqual(40);
    expect(i.lengthCm).toBeGreaterThan(5);
  });
  it('gros fil de puissance : 2,5 mm², Ø 3,6, fil libre avec marge', () => {
    const i = wireInfo(find(/^Fil fusible → Wago/), nest)!;
    expect(i.section).toBe('2,5 mm²');
    expect(i.diameter).toBe(3.6);
    expect(i.connector).toContain('Wago');
    expect(i.cordCm! % 5).toBe(0);
    expect(i.cordNote).toContain('marge');
  });
  it('câble du panneau : Ø 7, 2 × 4 mm²', () => expect(wireInfo(find(/^Câble 12 V/), nest)!.section).toContain('4 mm²'));
  it('nappes : largeur 16, longueur du commerce', () => {
    for (const re of [/^Nappe caméra$/, /^Nappe caméra 2/]) {
      const i = wireInfo(find(re), nest)!;
      expect(i.kind).toBe('ribbon');
      expect(i.diameter).toBe(16);
      expect(i.cordNote).toContain('nappe CSI');
      expect(i.colorName).toContain('orange');
    }
    expect(wireInfo({ ...find(/^Nappe caméra$/), path: [[0, 0, 0], [0, 0, 1500]] })!.cordCm).toBe(160); // plus longue que toutes les nappes courantes
  });
  it('gaine : Ø 16, longueur de gaine', () => {
    const i = wireInfo(find(/^Gaine des fils/), nest)!;
    expect(i.kind).toBe('conduit');
    expect(i.cordNote).toContain('gaine');
    expect(i.section).toContain('pas de cuivre');
  });
  it('câble d\'origine du ventilateur : rien à acheter', () => {
    const i = wireInfo(find(/^Fil cassette PWM/), nest)!;
    expect(i.cordCm).toBeNull();
    expect(i.cordNote).toContain('rien à acheter');
  });
  it('deux fils « Fil masse (noir) » : capteur (broche 9) et LED du nid (module OUT1)', () => {
    const grounds = nest.filter((p) => p.name === 'Fil masse (noir)');
    expect(grounds).toHaveLength(2);
    const infos = grounds.map((g) => wireInfo(g, nest)!);
    expect(infos.map((i) => i.pins)).toEqual([[9], []]);
    expect(infos[1].from).toContain('OUT1');
    expect(wireInfo(grounds[1])!.pins).toEqual([9]); // sans contexte : le capteur
  });
  it('fil inconnu : fiche non reconnue, longueur quand même calculée', () => {
    const i = wireInfo(mk({ name: 'Fil mystère', color: '#123456' }))!;
    expect(i.known).toBe(false);
    expect(i.from).toBe('');
    expect(i.lengthCm).toBe(10);
    expect(i.colorName).toBe('#123456');
    expect(wireInfo(mk({ special: 'cable', color: undefined }))!.color).toBe('#f59e0b');
    expect(wireInfo(mk({ special: 'conduit', path: undefined }))!.cordCm).toBe(5);
  });
});

describe('une fiche complète pour chaque fil de la scène par défaut', () => {
  for (const [nom, over] of [['default', {}], ['sans-cam2', { cam2: false }]] as const) {
    const nest = buildNest(over).planks;
    const wires = nest.filter(isWirePlank);
    it(`(${nom}) ${wires.length} fils, aucun inconnu`, () => {
      expect(wires.length).toBeGreaterThan(25);
      for (const w of wires) {
        const i = wireInfo(w, nest)!;
        expect(i.known, w.name).toBe(true);
        for (const k of ['from', 'to', 'role', 'voltage', 'current', 'connector', 'notes', 'section', 'cordNote', 'colorName'] as const) expect(i[k].trim(), `${w.name} : ${k}`).not.toBe('');
        expect(i.lengthCm, w.name).toBeGreaterThan(0);
        expect(i.color).toMatch(/^#[0-9a-f]{6}$/i);
        expect(i.diameter).toBe(w.w);
      }
    });
  }
  it('chaque broche citée figure dans le tableau « Branchements » du document, dans une cellule qui parle de broche', () => {
    const nest = buildNest({}).planks;
    const cells = branchements.split('\n').flatMap((l) => l.split('|'));
    for (const w of nest.filter(isWirePlank)) for (const pin of wireInfo(w, nest)!.pins) {
      expect(cells.some((c) => new RegExp(`broches?[^|]*\\b${pin}\\b`).test(c)), `${w.name} : broche ${pin}`).toBe(true);
    }
  });
  it('le texte « de → vers » cite la même broche que `pins`', () => {
    const nest = buildNest({}).planks;
    for (const w of nest.filter(isWirePlank)) {
      const i = wireInfo(w, nest)!;
      for (const pin of i.pins) expect(`${i.from} ${i.to}`, w.name).toMatch(new RegExp(`broche ${pin}\\b`));
    }
  });
  it('les fils vers les GPIO du Pi n\'utilisent jamais la même broche', () => {
    const nest = buildNest({}).planks;
    const all = nest.filter(isWirePlank).flatMap((w) => wireInfo(w, nest)!.pins);
    expect(new Set(all).size).toBe(all.length);
  });
});
