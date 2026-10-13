import { describe, expect, it } from 'vitest';
import { viewOf } from '@/features/viewer/components/AssemblyPanel/helpers';
import { ASSEMBLY_BLOCKS, KIND_LABEL, SEQ, SUBASSEMBLIES, assemblyBlocks, assemblySteps, isAssemblable, plankCodes, type AssemblyStep, type Plank, type PlankScene } from '@/birdhouse/model';
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
      if (['peindre', 'attendre', 'tester'].includes(s.kind)) expect(s.text, s.id).toBeTruthy();
    }
    expect(new Set(SEQ.map((r) => r.id)).size).toBe(SEQ.length);
  });
  it('les textes ne citent pas de code figé : une référence « (CODE) » vient de la scène', () => {
    const codes = new Set(plankCodes(sc0).values());
    for (const s of steps0) for (const m of (s.text ?? '').matchAll(/\(([A-Z]{1,3}-\d\d)\)/g)) expect(codes.has(m[1]), `${s.id} : ${m[1]}`).toBe(true);
  });
});

describe('assemblySteps : les ordres imposés', () => {
  it('Aération du corps < Nid < Pièces d\'hiver < Corps < Entrée < Toit < Électronique < Panneau solaire', () => {
    const order = ['hiver', 'aeration', 'nid', 'corps', 'entree', 'zonecam', 'goulotte', 'cassette', 'toit', 'habillage', 'couvercle', 'baguettes', 'elec', 'essais', 'solaire'];
    const firsts = order.map(blockFirst);
    expect(firsts.every((i) => i >= 0)).toBe(true);
    expect([...firsts].sort((a, b) => a - b)).toEqual(firsts);
    expect(assemblyBlocks(steps0).map((b) => b.id)).toEqual(order);
    // les blocs sont contigus
    for (const b of order) { const l = steps0.map((s, i) => (s.block === b ? i : -1)).filter((i) => i >= 0); expect(l[l.length - 1] - l[0] + 1, b).toBe(l.length); }
  });
  it('dans le corps : Dessous ext (COR-08) < isolant du bas (une seule étape) < aération < Plancher int (COR-09) < Face avant ext (COR-04) < reste ; module d’aération < paroi extérieure gauche ; la gaine avant la fermeture du corps', () => {
    const cote = idx(/^Côté gauche ext$/), module = stepIdx('corps-module-air'), gaine = idx(/^Gaine des fils/);
    const dessous = idx(/^Dessous ext$/), plancher = idx(/^Plancher int$/), avant = idx(/^Face avant ext$/);
    const bas = [1, 2, 3, 4].map((k) => idx(new RegExp(`^Isolant sous le plancher ${k}$`)));
    expect(new Set(bas).size).toBe(1); // une seule étape pour les quatre pièces
    expect(steps0[bas[0]].pieceIds).toHaveLength(4);
    const conduit = sc0.planks.filter((q) => /^Conduit d'air/.test(q.name)).map((q) => stepOf(steps0, q.id));
    expect(plankCodes(sc0).get(byName(sc0, /^Dessous ext$/).id)).toBe('COR-08');
    expect(plankCodes(sc0).get(byName(sc0, /^Plancher int$/).id)).toBe('COR-09');
    expect(plankCodes(sc0).get(byName(sc0, /^Face avant ext$/).id)).toBe('COR-04');
    const nid = ['Pièce en C sous le cadre', 'Côté droit int', 'Côté gauche int', 'Face arrière int', 'Face avant int'].map((n) => idx(new RegExp(`^${n}`)));
    const liners = [idx(/^Plaque isolant entrée droite$/), idx(/^Plaque isolant entrée dessous$/)]; // COR-16 puis COR-17, juste après COR-11 et COR-10, encore dans le bloc Nid
    expect(liners[0]).toBeGreaterThan(nid[4]); expect(liners[1]).toBeGreaterThan(liners[0]); for (const k of liners) expect(steps0[k].block).toBe('nid');
    expect(new Set(nid).size).toBe(5); expect(nid).toEqual([...nid].sort((x, y) => x - y)); // la pièce en C (COR-15) d'abord, puis les 4 parois intérieures une à une, toutes dans le bloc Nid (avant le Corps)
    for (const k of nid) { expect(steps0[k].pieceIds).toHaveLength(1); expect(steps0[k].block).toBe('nid'); }
    expect(blockFirst('nid')).toBeLessThan(blockFirst('corps')); expect(steps0.filter((s) => s.block === 'nid')).toHaveLength(7); expect(steps0[blockFirst('nid')].pieceIds).toEqual([byName(sc0, /^Pièce en C sous le cadre/).id]);
    const pose = stepIdx('corps-nid-pose'); // le nid se pose après le plancher intérieur (COR-09) et avant la paroi extérieure avant (COR-04)
    expect(steps0[pose].block).toBe('corps'); expect(steps0[pose].pieceIds).toEqual([]); expect(steps0[pose].focusIds).toEqual(sc0.planks.filter((q) => /^(Face avant|Face arrière|Côté droit|Côté gauche) int$|^Pièce en C sous le cadre|^Plaque isolant entrée/.test(q.name)).map((q) => q.id));
    expect(pose).toBeGreaterThan(plancher); expect(pose).toBeLessThan(avant);
    expect(dessous).toBeLessThan(bas[0]);
    const autour = [/^Isolant gauche 1$/, /^Isolant gauche 2$/, /^Isolant gauche 3$/, /^Isolant gauche dessus conduit/, /^Isolant droite$/, /^Isolant arrière$/, /^Isolant avant gauche$/, /^Isolant avant droite$/, /^Isolant sous le bloc d'entrée$/].map((re) => idx(re));
    expect(new Set(autour).size).toBe(1); // l'isolant autour du nid : une seule étape, après l'aération, avant toutes les parois extérieures
    expect(steps0[autour[0]].pieceIds).toHaveLength(9); // avec l'isolant du bloc d'entrée (sous le bloc, avant gauche, avant droite) : plus d'étape d'isolant dans le bloc Entrée
    expect(autour[0]).toBeGreaterThan(module); expect(autour[0]).toBeLessThan(avant); // tout l'isolant avant COR-04
    expect(idx(/^Face arrière ext$/)).toBeGreaterThan(avant); expect(gaine).toBeGreaterThan(idx(/^Face arrière ext$/)); expect(gaine).toBeLessThan(idx(/^Côté droit ext$/)); // COR-04, COR-05, puis la gaine entre l'isolant, puis COR-06
    expect(steps0[stepIdx('corps-etriers')].pieceIds).toHaveLength(4);
    for (const c of conduit) { expect(steps0[c].block).toBe('aeration'); expect(c).toBeGreaterThan(blockFirst('hiver')); expect(blockFirst('aeration')).toBeLessThanOrEqual(c); } // le module se monte à part, avant le Corps
    expect(bas[0]).toBeLessThan(module); expect(module).toBeLessThan(plancher); expect(steps0[module].pieceIds).toEqual([]); expect(steps0[module].block).toBe('corps');
    expect(plancher).toBeLessThan(avant);
    for (const re of [/^Face arrière ext$/, /^Côté droit ext$/, /^Fixation arbre 1\.1$/, /^Gaine des fils/]) expect(idx(re), String(re)).toBeGreaterThan(avant);
    expect(bas[0]).toBeLessThan(module);
    expect(module).toBeLessThan(cote);
    expect(gaine).toBeLessThan(cote);
    for (const re of [/^Isolant gauche 1$/, /^Isolant gauche dessus conduit/, /^Isolant droite$/, /^Isolant arrière$/]) { const i = idx(re); expect(i, String(re)).toBeGreaterThan(module); expect(i, String(re)).toBeLessThan(cote); }
    // le module d'aération (pièces du groupe « Aération du corps ») est posé plus haut dans le Corps, et le texte le dit
    expect(steps0[module].focusIds).toEqual(sc0.planks.filter((q) => /^Conduit d'air/.test(q.name)).map((q) => q.id));
    expect(steps0[module].text).toContain('monté à part');
    // dans la 3D : le module est caché depuis la fin du bloc Aération jusqu'à sa pose dans le corps, puis il reste visible
    const ids = sc0.planks.filter((q) => /^Conduit d'air/.test(q.name)).map((q) => q.id);
    for (let k = 0; k < steps0.length; k++) {
      const hidden = steps0[k].hideIds ?? [];
      for (const id of ids) expect(hidden.includes(id), `${k} ${steps0[k].id}`).toBe(k >= blockFirst('nid') && k < module);
    }
  });
  it('toit : zone caméra et goulotte montées à part avant le Toit, posées par une étape de texte ; isolation du toit = 1 étape', () => {
    const toit = steps0.map((st, i) => (st.block === 'toit' ? i : -1)).filter((i) => i >= 0), last = toit[toit.length - 1];
    expect(blockFirst('entree')).toBeLessThan(blockFirst('zonecam')); expect(blockFirst('zonecam')).toBeLessThan(blockFirst('goulotte')); expect(blockFirst('goulotte')).toBeLessThan(blockFirst('toit'));
    const cam = sc0.planks.filter((q) => /^(Face (avant|arrière)|Côté (droit|gauche)) caméra 1$/.test(q.name)), gou = sc0.planks.filter((q) => /^Goulotte ventilateur (gauche|droite|avant)$/.test(q.name));
    expect(cam).toHaveLength(4); expect(gou).toHaveLength(3);
    for (const [pieces, block, put] of [[cam, 'zonecam', 'toit-zone-camera'], [gou, 'goulotte', 'toit-goulotte']] as const) {
      for (const p of pieces) expect(steps0[stepOf(steps0, p.id)].block, p.name).toBe(block);
      const i = stepIdx(put);
      expect(steps0[i].block).toBe('toit'); expect(steps0[i].pieceIds).toEqual([]); expect(steps0[i].focusIds).toEqual(pieces.map((p) => p.id));
      expect(i).toBeGreaterThan(idx(/^Dessous toit$/)); expect(i).toBeLessThan(idx(/^Baguette dessus toit avant$/)); expect(i).toBeLessThan(idx(/^Isolant toit 1$/));
      steps0.forEach((st, k) => { for (const p of pieces) expect((st.hideIds ?? []).includes(p.id), `${st.id} ${p.name}`).toBe(k > blockFirst(block) + steps0.filter((x) => x.block === block).length - 1 && k < i); });
    }
    expect(stepIdx('toit-goulotte')).toBeGreaterThan(stepIdx('toit-zone-camera'));
    const nIso = sc0.planks.filter((p) => /^Isolant toit \d+$/.test(p.name)).length; // 7 pavés + 3 autour du fourreau de la gaine
    const iso = Array.from({ length: nIso }, (_, k) => idx(new RegExp(`^Isolant toit ${k + 1}$`)));
    expect(nIso).toBeGreaterThanOrEqual(7); expect(new Set(iso).size).toBe(1); expect(steps0[iso[0]].pieceIds).toHaveLength(nIso); expect(steps0[iso[0]].title).toBe('Isolation du toit');
    expect(iso[0]).toBeLessThan(idx(/^Dessus toit$/)); expect(iso[0]).toBeGreaterThan(stepIdx('toit-goulotte'));
    const cadre = ['haut', 'milieu', 'bas'].map((k) => idx(new RegExp(`^Cadre toit ${k}$`)));
    expect(plankCodes(sc0).get(byName(sc0, /^Cadre toit haut$/).id)).toMatch(/^T-\d\d$/); // le cadre est de nouveau dans le groupe Toit
    expect(new Set(cadre).size).toBe(1); expect(steps0[cadre[0]].block).toBe('toit'); expect(steps0[cadre[0]].pieceIds).toHaveLength(3); expect(cadre[0]).toBe(last); expect(cadre[0]).toBeGreaterThan(stepIdx('toit-cassette'));
    expect(sc0.planks.some((p) => /verrouillage/.test(p.name))).toBe(false); // la plaque en C est supprimée
  });
  it('cassette du ventilateur : montée à part (bloc avant le Toit), glissée par une étape de texte ; ordre des sous-ensembles', () => {
    const re = /^(Cassette ventilateur|Grille de protection ventilateur|Plot caoutchouc ventilateur|Ventilateur Noctua|Poignée cassette|Prise 4 broches du ventilateur|Câble d'origine du ventilateur|Conduit de sortie)/;
    const pieces = sc0.planks.filter((q) => re.test(q.name)).filter((q) => !/^Rallonge/.test(q.name));
    expect(pieces.length).toBeGreaterThan(20);
    for (const p of pieces) expect(steps0[stepOf(steps0, p.id)].block, p.name).toBe('cassette');
    expect(['hiver', 'aeration', 'corps', 'entree', 'zonecam', 'goulotte', 'cassette', 'toit'].map(blockFirst)).toEqual([...['hiver', 'aeration', 'corps', 'entree', 'zonecam', 'goulotte', 'cassette', 'toit'].map(blockFirst)].sort((a, b) => a - b));
    const i = stepIdx('toit-cassette');
    expect(steps0[i].pieceIds).toEqual([]); expect(steps0[i].focusIds!.length).toBeGreaterThan(0);
    expect(i).toBeGreaterThan(stepIdx('toit-goulotte')); expect(i).toBeLessThan(blockFirst('habillage'));
    expect(i).toBeLessThan(blockFirst('elec'));
    expect(steps0[i].text).toContain('se glisse par le haut dans la goulotte');
    steps0.forEach((st, k) => { for (const p of pieces) expect((st.hideIds ?? []).includes(p.id), `${st.id} ${p.name}`).toBe(k > Math.max(...steps0.map((x, j) => (x.block === 'cassette' ? j : -1))) && k < i); });
  });
  it('ventilateur : cassette glissée < rallonge et fils du ventilateur < essais (établi, multimètre, batterie) < toit en okoumé posé en dernier', () => {
    const toitOkoume = stepIdx('elec-pose-toit'), cassette = stepIdx('toit-cassette');
    const fan = sc0.planks.filter((p) => /^(Rallonge ventilateur|Module relais 3 V ventilateur|Fil (PWM|tachymètre|masse commune|commande interrupteur) ventilateur|Fil (Wago \+ → interrupteur|interrupteur → ventilateur|ventilateur −|3,3 V relais|masse relais))/.test(p.name));
    expect(fan.length).toBeGreaterThanOrEqual(10);
    for (const p of fan) { const i = stepOf(steps0, p.id); expect(i, p.name).toBeGreaterThan(cassette); expect(i, p.name).toBeLessThan(stepIdx('essai-multimetre')); expect(i, p.name).toBeLessThan(toitOkoume); }
    expect(stepIdx('essai-multimetre')).toBeLessThan(stepIdx('essai-batterie')); expect(stepIdx('essai-batterie')).toBeLessThan(toitOkoume);
    expect(steps0[toitOkoume].block).toBe('essais');
  });
  it('les étriers du régulateur sont la toute dernière étape du bloc Corps, après « Côté gauche ext »', () => {
    const last = steps0.map((s, i) => (s.block === 'corps' ? i : -1)).filter((i) => i >= 0).pop()!;
    expect(stepIdx('corps-etriers-bat')).toBe(last);
    expect(stepIdx('corps-etriers')).toBeGreaterThan(idx(/^Côté gauche ext$/));
    expect(steps0[last].pieceIds).toEqual(sc0.planks.filter((p) => /^Étrier batterie/.test(p.name)).map((p) => p.id)); // étriers du régulateur puis de la batterie : les deux dernières étapes du Corps
    expect(stepIdx('corps-etriers')).toBe(last - 1);
    expect(steps0[last - 1].pieceIds).toEqual(sc0.planks.filter((p) => /^Étrier régulateur/.test(p.name)).map((p) => p.id));
    expect(steps0[last + 1].block).toBe('entree');
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
  it('électronique : plus de bloc « Pi et essais sur l\'établi », essais avec la batterie avant le panneau solaire, panneau solaire en dernier', () => {
    expect(steps0.some((x) => x.block === 'banc')).toBe(false); // retiré du montage à la demande de l'utilisateur (textes gardés dans archives/montage-pi-etabli.md)
    for (const id of ['pi-sd', 'pi-programme', 'banc-capteurs', 'banc-cameras', 'banc-ventilateur', 'banc-page']) expect(steps0.some((x) => x.id === id), id).toBe(false);
    expect(ASSEMBLY_BLOCKS.some((b) => b.id === 'banc')).toBe(false);
    const tests = ['essai-multimetre', 'essai-batterie'].map(stepIdx);
    const panel = idx(/^Panneau solaire/), cable = idx(/^Câble 12 V panneau \+/);
    for (const t of tests) { expect(t).toBeGreaterThan(idx(/^Batterie/)); expect(t).toBeGreaterThan(idx(/^Fusible/)); expect(t).toBeGreaterThan(idx(/^Régulateur de charge/)); expect(t).toBeLessThan(panel); }
    expect(panel).toBe(steps0.length - 2);
    expect(cable).toBe(steps0.length - 1);
    const lastKinds = steps0.slice(steps0.findIndex((s) => s.block === 'solaire')).map((s) => s.block);
    expect(new Set(lastKinds)).toEqual(new Set(['solaire']));
  });
  it('la finition est au bon moment : peinture avant le collage de l\'habillage, toit en okoumé saturé', () => {
    expect(stepIdx('hab-peinture')).toBeLessThan(stepIdx('hab-cotes.lambris-droite-1'));
    expect(stepIdx('hab-sechage')).toBeLessThan(stepIdx('hab-cotes.lambris-droite-1'));
    expect(stepIdx('couv-saturateur')).toBeGreaterThan(idx(/^Toit en okoumé \(plaque pleine\)/));
    expect(steps0[stepIdx('couv-saturateur')].text).toContain('Luxens'); expect(steps0[stepIdx('hab-sechage')].text).toContain("selon l'étiquette");
    expect(steps0[stepIdx('hab-peinture')].text).toContain('blanc');
    expect(steps0.some((st) => st.id.startsWith('ent-iso'))).toBe(false);
    const wires = idx(/^Câble d'origine du ventilateur/), lid = idx(/^Cassette ventilateur couvercle$/), handle = idx(/^Poignée cassette 1$/);
    expect(wires).toBeLessThan(lid); expect(wires).toBeLessThan(handle); expect(wires).toBeGreaterThan(idx(/^Ventilateur Noctua/)); // les fils du ventilateur avant le couvercle et la poignée
  });
  it('sous-ensembles montés à part (aération, nid, zone caméra, goulotte, cassette) : visibles pendant leur bloc, ABSENTS de l écran entre la fin du bloc et leur pose, visibles de nouveau après', () => {
    for (const sub of SUBASSEMBLIES) {
      const ids = sc0.planks.filter((q) => sub.re.test(q.name) && !/^Rallonge/.test(q.name) && !q.spareOf).map((q) => q.id);
      expect(ids.length, sub.block).toBeGreaterThanOrEqual(3);
      const put = stepIdx(sub.put), last = Math.max(...steps0.map((x, j) => (x.block === sub.block ? j : -1)));
      expect(blockFirst(sub.block)).toBeLessThan(put);
      steps0.forEach((st, k) => {
        const { visible } = viewOf(steps0, k);
        for (const id of ids) {
          const own = steps0.findIndex((x) => x.pieceIds.includes(id)); // étape qui pose la pièce
          if (k < own) { if (!st.focusIds?.includes(id)) expect(visible.has(id), `${st.id} avant sa pose`).toBe(false); }
          else if (k <= last) expect(visible.has(id), `${st.id} pendant le bloc ${sub.block}`).toBe(true);
          else if (k < put) expect(visible.has(id), `${st.id} entre le bloc ${sub.block} et sa pose`).toBe(false);
          else expect(visible.has(id), `${st.id} après la pose`).toBe(true);
        }
      });
    }
    const nid = sc0.planks.filter((q) => /^(Face avant|Face arrière|Côté droit|Côté gauche) int$|^Pièce en C sous le cadre|^Plaque isolant entrée/.test(q.name)).map((q) => q.id);
    const seul = viewOf(steps0, steps0.map((s) => s.block).lastIndexOf('nid')).visible; // pendant le bloc Nid : le nid monté seul
    for (const id of nid) expect(seul.has(id)).toBe(true);
    const hiv = steps0.filter((x) => x.block === 'hiver').flatMap((x) => x.pieceIds); expect(seul.size).toBe(nid.length + hiv.length); // le nid monté est seul à l'écran avec les pièces d'hiver déjà faites (le module d'aération est caché dès la fin de son bloc)
    expect(viewOf(steps0, stepIdx('corps-nid-pose')).highlight.size).toBe(nid.length); // à la pose : la pièce en C, les quatre parois et les plaques de l'entrée surlignées en place
  });
  it('les baguettes de cale : une seule étape de texte ; les composants se calent avec', () => {
    const s = steps0.filter((x) => x.block === 'baguettes');
    expect(s).toHaveLength(1);
    expect(s[0].pieceIds).toHaveLength(4);
    expect(s[0].text).toContain('couper');
  });
  it('le toit en okoumé est caché pendant tout le travail dans le grenier, puis reposé avant le panneau solaire', () => {
    const lid = sc0.planks.filter((p) => /^(Toit en okoumé|Baguette couvercle)/.test(p.name)).map((p) => p.id);
    const back = stepIdx('elec-pose-toit');
    steps0.forEach((s, i) => {
      if (i >= blockFirst('elec') && i < back) expect(s.hideIds, s.id).toEqual(lid); else expect((s.hideIds ?? []).filter((id) => lid.includes(id)), s.id).toEqual([]); // hors du grenier, seul le module d'aération (non posé) peut être caché
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
    const steps = assemblySteps(scene([mk('Pièce mystère'), mk('Face avant ext'), mk('Face avant ext', { w: 20 }), mk('Truc', { spareOf: 'x' }), mk('Ignoré (rechange 2)'), mk('Doc', { special: 'doc' })]));
    expect(steps.find((s) => s.block === 'divers')!.title).toBe('Pièce mystère (X-01)');
    const ids = steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(steps.filter((s) => s.block === 'corps' && s.pieceIds.length)).toHaveLength(2); // deux pièces de même nom mais de tailles différentes : deux étapes aux identifiants distincts
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
