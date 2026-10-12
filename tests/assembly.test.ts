import { describe, expect, it } from 'vitest';
import { ASSEMBLY_BLOCKS, KIND_LABEL, SEQ, assemblyBlocks, assemblySteps, isAssemblable, plankCodes, type AssemblyStep, type Plank, type PlankScene } from '@/birdhouse/model';
import { VARIANTS, buildNest, buildNestFull } from './helpers';

const sc0 = buildNest({});
const steps0 = assemblySteps(sc0);
const byName = (sc: PlankScene, re: RegExp): Plank => { const l = sc.planks.filter((p) => re.test(p.name)); expect(l, String(re)).toHaveLength(1); return l[0]; };
const stepOf = (steps: AssemblyStep[], id: string): number => steps.findIndex((s) => s.pieceIds.includes(id));
const idx = (re: RegExp, sc = sc0, steps = steps0): number => stepOf(steps, byName(sc, re).id);
const stepIdx = (id: string): number => { const i = steps0.findIndex((s) => s.id === id); expect(i, id).toBeGreaterThanOrEqual(0); return i; };
const blockFirst = (b: string): number => steps0.findIndex((s) => s.block === b);
const mk = (name: string, over: Partial<Plank> = {}): Plank => ({ id: name + Math.random(), name, w: 10, h: 10, pos: [0, 0, 0], rot: [0, 0, 0], notches: [], holes: [], ...over });
const scene = (planks: Plank[]): PlankScene => ({ t: 3, fit: 0, up: 'z2', planks });

/** Pièces de rechange et document : jamais d'étape. */
const exempt = (p: Plank) => !isAssemblable(p);

describe('assemblySteps : chaque pièce dans UNE étape', () => {
  for (const [name, over] of Object.entries(VARIANTS)) {
    it(`(${name}) toute pièce hors rechange et document est dans une seule étape, aucune étape n'ignore une pièce`, () => {
      const sc = buildNest(over);
      const steps = assemblySteps(sc);
      const count = new Map<string, number>();
      for (const s of steps) for (const id of s.pieceIds) count.set(id, (count.get(id) ?? 0) + 1);
      const ids = new Set(sc.planks.map((p) => p.id));
      for (const p of sc.planks) expect(count.get(p.id) ?? 0, p.name).toBe(exempt(p) ? 0 : 1);
      for (const s of steps) for (const id of [...s.pieceIds, ...(s.focusIds ?? []), ...(s.hideIds ?? [])]) expect(ids.has(id), `${s.id} : ${id}`).toBe(true);
      expect(steps.filter((s) => s.block === 'divers')).toEqual([]); // aucune pièce inconnue de la table
    });
  }
  it('les rechanges (pièces fines, « (rechange k) ») et le document n\'ont pas d\'étape', () => {
    const full = buildNestFull({});
    const steps = assemblySteps(full);
    const spares = full.planks.filter((p) => p.spareOf);
    expect(spares.length).toBeGreaterThan(0);
    const used = new Set(steps.flatMap((s) => s.pieceIds));
    for (const p of spares) expect(used.has(p.id), p.name).toBe(false);
    expect(used.has(byName(full, /^Schéma électronique$/).id)).toBe(false);
    expect(steps).toHaveLength(steps0.length);
  });
  it('les identifiants des étapes sont uniques et stables (deux calculs identiques)', () => {
    const ids = steps0.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(assemblySteps(sc0).map((s) => s.id)).toEqual(ids);
    expect(assemblySteps(buildNest({})).map((s) => s.id)).toEqual(ids);
  });
  it('les pièces strictement identiques (même code) sont dans la même étape', () => {
    const codes = plankCodes(sc0);
    for (const s of steps0) {
      const c = new Set(s.pieceIds.map((id) => codes.get(id)).filter(Boolean));
      if (s.kind !== 'placer' || s.pieceIds.length < 2) continue;
      expect(c.size <= 1 || s.pieceIds.length > 4, s.id).toBe(true);
    }
    for (const [code] of new Set([...codes.values()].map((c) => [c]))) {
      const where = new Set([...codes].filter(([, c]) => c === code).map(([id]) => stepOf(steps0, id)).filter((i) => i >= 0));
      expect(where.size, code).toBeLessThanOrEqual(1);
    }
  });
  it('chaque étape a un titre, une nature connue, un bloc connu ; un texte quand elle est de finition ou d\'essai', () => {
    const blocks = new Set(ASSEMBLY_BLOCKS.map((b) => b.id));
    for (const s of steps0) {
      expect(s.title.length, s.id).toBeGreaterThan(0);
      expect(KIND_LABEL[s.kind], s.id).toBeTruthy();
      expect(blocks.has(s.block), s.id).toBe(true);
      if (['huiler', 'peindre', 'attendre', 'tester'].includes(s.kind)) expect(s.text, s.id).toBeTruthy();
    }
    expect(new Set(SEQ.map((r) => r.id)).size).toBe(SEQ.length);
  });
  it('les textes ne citent pas de code figé : une référence « (CODE) » vient de la scène', () => {
    const codes = new Set(plankCodes(sc0).values());
    for (const s of steps0) for (const m of (s.text ?? '').matchAll(/\(([A-Z]{1,3}-\d\d)\)/g)) expect(codes.has(m[1]), `${s.id} : ${m[1]}`).toBe(true);
  });
});

describe('assemblySteps : les ordres imposés', () => {
  it('Aération du corps < Pièces d\'hiver < Corps < Entrée < Toit < Électronique < Panneau solaire', () => {
    const order = ['aeration', 'hiver', 'corps', 'entree', 'toit', 'habillage', 'couvercle', 'baguettes', 'banc', 'elec', 'essais', 'solaire'];
    const firsts = order.map(blockFirst);
    expect(firsts.every((i) => i >= 0)).toBe(true);
    expect([...firsts].sort((a, b) => a - b)).toEqual(firsts);
    expect(assemblyBlocks(steps0).map((b) => b.id)).toEqual(order);
    // les blocs sont contigus
    for (const b of order) { const l = steps0.map((s, i) => (s.block === b ? i : -1)).filter((i) => i >= 0); expect(l[l.length - 1] - l[0] + 1, b).toBe(l.length); }
  });
  it('dans le corps : isolation du bas < module d\'aération < paroi extérieure gauche ; la gaine avant la fermeture du corps', () => {
    const cote = idx(/^Côté gauche ext$/), module = stepIdx('corps-module-air'), gaine = idx(/^Gaine des fils/);
    const bas = [1, 2, 3, 4].map((k) => idx(new RegExp(`^Isolant sous le plancher ${k}$`)));
    for (const b of bas) expect(b).toBeLessThan(module);
    expect(module).toBeLessThan(cote);
    expect(gaine).toBeLessThan(cote);
    for (const re of [/^Isolant gauche 1$/, /^Isolant gauche dessus conduit/, /^Isolant droite$/, /^Isolant arrière$/]) { const i = idx(re); expect(i, String(re)).toBeGreaterThan(module); expect(i, String(re)).toBeLessThan(cote); }
    // le module d'aération (pièces du groupe « Aération du corps ») est posé avant, et le texte le dit
    for (const p of sc0.planks.filter((q) => /^Conduit d'air/.test(q.name))) expect(stepOf(steps0, p.id)).toBeLessThan(blockFirst('corps'));
    expect(steps0[module].focusIds).toEqual(sc0.planks.filter((q) => /^Conduit d'air/.test(q.name)).map((q) => q.id));
    expect(steps0[module].text).toContain('« Côté gauche ext » (COR-07)');
  });
  it('« Côté gauche ext » porte le code COR-07 de la scène par défaut', () => {
    expect(plankCodes(sc0).get(byName(sc0, /^Côté gauche ext$/).id)).toBe('COR-07');
  });
  it('le groupe « Aération du corps » porte les cinq plaques du conduit (codes A-xx)', () => {
    const g = Object.entries(sc0.groupNames ?? {}).find(([, n]) => n === 'Aération du corps')![0];
    const m = sc0.planks.filter((p) => p.group === g);
    expect(m.map((p) => p.name).sort()).toEqual(["Conduit d'air 1", "Conduit d'air 2", "Conduit d'air 3", "Conduit d'air 4", "Conduit d'air 5 (couvercle)"]);
    const codes = plankCodes(sc0);
    for (const p of m) expect(codes.get(p.id)).toMatch(/^A-\d\d$/);
    for (const p of sc0.planks.filter((q) => q.group && sc0.groupNames?.[q.group] === 'Ventilation')) expect(codes.get(p.id) ?? 'V-').toMatch(/^V-/);
  });
  it('électronique : essais sur l\'établi avant l\'installation, essais avec la batterie avant le panneau solaire, panneau solaire en dernier', () => {
    const install = idx(/^Raspberry Pi/), bench = ['pi-sd', 'pi-programme', 'banc-capteurs', 'banc-cameras', 'banc-ventilateur', 'banc-page'].map(stepIdx);
    for (const b of bench) expect(b).toBeLessThan(install);
    const tests = ['essai-multimetre', 'essai-batterie'].map(stepIdx);
    const panel = idx(/^Panneau solaire/), cable = idx(/^Câble 12 V vers le toit/);
    for (const t of tests) { expect(t).toBeGreaterThan(idx(/^Batterie/)); expect(t).toBeGreaterThan(idx(/^Fusible/)); expect(t).toBeGreaterThan(idx(/^Régulateur de charge/)); expect(t).toBeLessThan(panel); }
    expect(panel).toBe(steps0.length - 2);
    expect(cable).toBe(steps0.length - 1);
    const lastKinds = steps0.slice(steps0.findIndex((s) => s.block === 'solaire')).map((s) => s.block);
    expect(new Set(lastKinds)).toEqual(new Set(['solaire']));
    for (const s of steps0.filter((x) => x.block === 'banc')) expect(s.kind === 'installer' || s.kind === 'tester').toBe(true);
    expect(steps0[stepIdx('pi-sd')].text).toContain('1-Wire');
    expect(steps0[stepIdx('pi-sd')].text).toContain('dtoverlay=w1-gpio');
    expect(steps0[stepIdx('pi-programme')].text).toContain('nichoir.service');
    expect(steps0[stepIdx('banc-capteurs')].text).toContain('8080');
    expect(steps0[stepIdx('banc-ventilateur')].text).toContain('PWM');
  });
  it('la finition est au bon moment : huile avant la pose des pièces, peinture avant le collage de l\'habillage, toit en okoumé huilé', () => {
    expect(stepIdx('aer-huile')).toBeLessThan(idx(/^Conduit d'air 2$/));
    expect(stepIdx('corps-huile')).toBeLessThan(idx(/^Dessous ext$/));
    expect(stepIdx('toit-huile')).toBeLessThan(idx(/^Cadre toit haut$/));
    expect(stepIdx('hab-peinture')).toBeLessThan(stepIdx('hab-cotes.lambris-droite-1'));
    expect(stepIdx('hab-sechage')).toBeLessThan(stepIdx('hab-cotes.lambris-droite-1'));
    expect(stepIdx('couv-huile')).toBeGreaterThan(idx(/^Toit en okoumé \(plaque pleine\)/));
    expect(steps0[stepIdx('aer-huile')].text).toMatch(/24 à 72|couche fine/);
    for (const id of ['aer-huile', 'corps-huile', 'toit-huile', 'couv-huile', 'ent-huile', 'hiv-huile']) expect(steps0[stepIdx(id)].kind).toBe('huiler');
    const all = steps0.filter((s) => s.kind === 'huiler').map((s) => s.text).join('\n');
    expect(all).toContain('chiffon'); expect(all).toContain('ruban de peintre'); expect(all).toContain('chants'); expect(all).toContain('15 à 30 minutes');
    expect(steps0[stepIdx('aer-sechage')].text).toContain('24 à 72 heures');
    expect(steps0[stepIdx('hab-peinture')].text).toContain('blanc');
    expect(steps0[stepIdx('corps-huile')].text).toContain('Plancher int');
    expect(steps0[stepIdx('corps-huile')].text).toContain('EN 71-3');
    const interior = ['Plancher int', 'Face avant int', 'Face arrière int', 'Côté droit int', 'Côté gauche int'].map((n) => sc0.planks.find((p) => p.name === n)!.id);
    for (const id of interior) expect(steps0[stepIdx('corps-huile')].focusIds).not.toContain(id); // l'intérieur du nid n'est jamais huilé
  });
  it('les baguettes de cale : une seule étape de texte ; les composants se calent avec', () => {
    const s = steps0.filter((x) => x.block === 'baguettes');
    expect(s).toHaveLength(1);
    expect(s[0].pieceIds).toHaveLength(6);
    expect(s[0].text).toContain('couper');
  });
  it('le toit en okoumé est caché pendant tout le travail dans le grenier, puis reposé avant le panneau solaire', () => {
    const lid = sc0.planks.filter((p) => /^(Toit en okoumé|Baguette couvercle)/.test(p.name)).map((p) => p.id);
    const back = stepIdx('elec-pose-toit');
    steps0.forEach((s, i) => {
      if (i >= blockFirst('banc') && i < back) expect(s.hideIds, s.id).toEqual(lid); else expect(s.hideIds, s.id).toBeUndefined();
    });
    expect(steps0[back].focusIds).toEqual(lid);
  });
  it('le bloc d\'entrée est empilé en une étape, du dehors vers le nid', () => {
    const s = steps0[stepIdx('ent-bloc')];
    expect(s.pieceIds).toHaveLength(15);
    expect(s.text).toContain('« Entrée 1 »');
  });
  it('toutes les natures d\'étape annoncées sont employées', () => {
    expect(new Set(steps0.map((s) => s.kind))).toEqual(new Set(Object.keys(KIND_LABEL)));
  });
});

describe('assemblySteps : scènes particulières', () => {
  it('scène vide : aucune étape ; blocs vides', () => {
    expect(assemblySteps(scene([]))).toEqual([]);
    expect(assemblyBlocks([])).toEqual([]);
  });
  it('une pièce inconnue va dans le bloc « Autres pièces » ; des pièces de même nom ont des identifiants d\'étape distincts', () => {
    const steps = assemblySteps(scene([mk('Pièce mystère'), mk('Isolant gauche 1', { special: 'block' }), mk('Isolant gauche 1', { special: 'block' }), mk('Truc', { spareOf: 'x' }), mk('Ignoré (rechange 2)'), mk('Doc', { special: 'doc' })]));
    expect(steps.find((s) => s.block === 'divers')!.title).toBe('Pièce mystère (X-01)');
    const ids = steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(steps.filter((s) => s.block === 'corps')).toHaveLength(2);
    const placed = steps.filter((s) => s.pieceIds.length); // les étapes d'installation du Pi n'ont pas de pièce
    expect(placed).toHaveLength(3);
    expect(assemblyBlocks(placed).map((b) => [b.id, b.first, b.count])).toEqual([['corps', 0, 2], ['divers', 2, 1]]);
  });
  it('titres : pièces identiques de noms longs abrégés ; pas de toit à cacher sans les pièces du couvercle', () => {
    const long = 'Une très longue pièce numéro un, vraiment très longue';
    const a = mk(long), b = mk('Une très longue pièce numéro deux, vraiment très longue', { w: 10 });
    const steps = assemblySteps(scene([a, b, mk('Pilier 1', { w: 20 }), mk('Pilier 2', { w: 20 })]));
    expect(steps.filter((s) => s.block === 'divers').map((s) => s.title)).toEqual(['2 × Une très longue pièce numéro un, vraiment très longue … (X-01)', '2 × Pilier (X-02)']);
    expect(steps.every((s) => !s.hideIds)).toBe(true);
  });
  it('un texte qui cite une pièce absente garde un repère lisible ; une pièce sans code est citée sans code', () => {
    const steps = assemblySteps(scene([mk('Face avant ext'), mk('Entrée 1', { special: 'block' })]));
    const t = steps.find((s) => s.id === 'corps-avant-ext')!.text!;
    expect(t).toContain('« Côté gauche ext »');
    const e = steps.find((s) => s.id === 'ent-bloc')!;
    expect(e.text).toContain('« Entrée 1 »');
    expect(e.text).not.toMatch(/« Entrée 1 » \(/);
  });
});
