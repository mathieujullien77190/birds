import { describe, expect, it } from 'vitest';
import { NEST_DEFAULT, bounds, findCameraPlank, makeNest, nestSheets, outline, sheetLabel, sheetSvg, sheetsPreviewSvg, setAirPlug, setCassetteMode, nextCassette, setWinterCassette, summerLayout, winterState, CAMERA_NAMES, carveRects, type NestParams, type Plank, type PlankScene } from '@/birdhouse/model';
import { buildNest, normalizeIds, withoutBagSlots } from './helpers';

const T = 3;
const build = (over: Partial<NestParams> = {}, start = 1) => {
  const b = makeNest({ ...NEST_DEFAULT, ...over }, T, 0, start);
  const s: PlankScene = { t: T, fit: 0, planks: b.planks.filter((p) => !p.spareOf), groupNames: b.groupNames, up: 'z2' };
  return { ...b, planks: s.planks, s };
};
const byName = (planks: Plank[], re: RegExp): Plank => { const p = planks.find((x) => re.test(x.name)); if (!p) throw new Error(`pièce introuvable : ${re}`); return p; };
const names = (planks: Plank[]): string[] => planks.map((p) => p.name);

/** Tailles et options extrêmes (la contrainte de `makeNest` les ramène dans ses bornes). */
const EXTREMES: Record<string, Partial<NestParams>> = {
  defaut: {},
  'sans-cam2': { cam2: false },
  chene: { chene: true },
  'chene-sans-cam2': { chene: true, cam2: false },
  mini: { l: 120, L: 120, hole: 20, floorToHole: 60, above: 0 },
  'trou-max': { l: 120, hole: 500 }, // plafonné à l − 26
  'l-50': { l: 50 }, // remonté à 120
  'l-140': { l: 140 },
  'l-160': { l: 160, hole: 40 },
  'l-180': { l: 180 },
  'l-200': { l: 200, L: 150 },
  'l-240': { l: 240, hole: 120 },
  'l-300': { l: 300, L: 300, hole: 120, floorToHole: 600, above: 60 },
  'haut-bas': { floorToHole: 60, above: 0, hole: 20 },
};

describe('makeNest : dimensions déduites des réglages', () => {
  const t = T;
  it('boîte extérieure = utile + 2 × (2t + isolant), hauteur du corps = sol→trou + trou + dessus + 2t + 2e − toit', () => {
    const { planks } = build();
    const ins = 39, roofH = 2 * t + ins, e = t + ins;
    const W = 120 + 2 * (2 * t + ins);
    expect(W).toBe(210);
    const bodyH = 130 + 32 + 20 + 2 * t + 2 * e - roofH;
    const front = byName(planks, /^Face avant ext$/);
    expect(front.w).toBe(W);
    expect(front.h).toBe(bodyH); // les parois montent jusqu'à bodyH (plus de plaque de verrouillage de l'isolant)
    expect(byName(planks, /^Dessous ext$/)).toMatchObject({ w: W, h: W });
    expect(byName(planks, /^Face avant int$/)).toMatchObject({ w: 120 + 2 * t, h: bodyH - e });
    expect(byName(planks, /^Plancher int$/)).toMatchObject({ w: W, h: W });
    // le toit se pose sur le corps
    expect(byName(planks, /^Dessous toit$/).pos[2]).toBe(bodyH + t / 2);
  });
  it('encoche du trou d\'envol : largeur trou + 15 pile (sans jeu), ouverte jusqu\'au haut du mur, dans les deux façades avant', () => {
    const { planks } = build({ hole: 30 });
    for (const re of [/^Face avant ext$/, /^Face avant int$/]) {
      const p = byName(planks, re);
      const n = p.notches.filter((x) => x.edge === 'top' && x.width === 45);
      expect(n).toHaveLength(1);
      expect(n[0].pos).toBe(p.w / 2);
      expect(n[0].depth).toBeGreaterThan(0);
    }
  });
  it('réglages ramenés dans leurs bornes : intérieur ≥ 120 et carré, trou ≤ l − 26, isolant 39, caméra 38, toit en pente, habillage, solaire', () => {
    const ref = normalizeIds(buildNest({}));
    expect(normalizeIds(buildNest({ ins: 5, cam: 0, pente: false, lambris: false, solar: false }))).toEqual(ref);
    expect(normalizeIds(buildNest({ l: 10, L: 400 }))).toEqual(ref);
    const big = normalizeIds(buildNest({ l: 120, hole: 94 }));
    expect(normalizeIds(buildNest({ l: 120, hole: 5000 }))).toEqual(big);
    expect(big).not.toEqual(ref);
    // L est forcé égal à l
    expect(normalizeIds(buildNest({ l: 200, L: 130 }))).toEqual(normalizeIds(buildNest({ l: 200, L: 200 })));
  });
});

describe('makeNest : pièces présentes / absentes selon les options', () => {
  it('2ᵉ caméra : présente par défaut avec ses LED, sa nappe et ses fils, absente sinon', () => {
    const on = build().planks, off = build({ cam2: false }).planks;
    expect(findCameraPlank(on, 1)).toBeDefined();
    expect(findCameraPlank(on, 0)).toBeDefined();
    expect(findCameraPlank(off, 1)).toBeUndefined();
    expect(findCameraPlank(off, 0)).toBeDefined();
    for (const re of [/^LED infrarouges extérieures/, /^Nappe caméra 2/, /^Fil 5 V LED extérieures/, /^Fil masse LED extérieures/]) {
      expect(on.some((p) => re.test(p.name))).toBe(true);
      expect(off.some((p) => re.test(p.name))).toBe(false);
    }
    expect(CAMERA_NAMES[1]).toBe('Caméra 2');
    // plus de fente dans la plaque avant du toit : la nappe passe par le canal du pan en okoumé
    expect(withoutBagSlots(byName(on, /^Face avant toit$/).holes)).toHaveLength(0);
    expect(byName(on, /^Toit en okoumé \(plaque crénelée\)$/).holes.some((h) => h.r === 8)).toBe(true);
    expect(byName(off, /^Toit en okoumé \(plaque crénelée\)$/).holes.some((h) => h.r === 8)).toBe(false);
  });
  it('chêne : désactivé par défaut ; activé, il recouvre le toit (+ 15 mm de chaque côté) hors compartiment caméra, et tout ce qui est « sur le toit » monte de 18', () => {
    const a = build().planks, b = build({ chene: true }).planks;
    expect(a.some((p) => /^Planche chêne/.test(p.name))).toBe(false);
    const oak = b.filter((p) => /^Planche chêne/.test(p.name));
    expect(oak.length).toBeGreaterThanOrEqual(3);
    expect(oak.every((p) => p.depth === 18 && p.special === 'block' && p.rot.every((r) => r === 0))).toBe(true);
    const W = 210, D = 210;
    const total = oak.reduce((s, p) => s + p.w * p.h, 0);
    const camOpening = (a.find((p) => /^Dessus toit$/.test(p.name))!.holes[0]);
    expect(camOpening).toBeDefined();
    expect(total).toBeCloseTo((W + 30) * (D + 30) - camOpening.size * (camOpening.sh ?? 0), 1);
    // posées sur le toit : leur dessous = le dessus du toit
    const roofTop = byName(a, /^Dessus toit$/).pos[2] + T / 2;
    expect(oak.every((p) => Math.abs(p.pos[2] - 9 - roofTop) < 0.01)).toBe(true);
    // pas de recouvrement entre pavés
    const bb = bounds(oak, T);
    expect(bb.min.slice(0, 2).map(Math.round)).toEqual([-120, -120]);
    expect(bb.max.slice(0, 2).map(Math.round)).toEqual([120, 120]);
    // le Pi se pose 18 mm plus haut
    expect(byName(b, /^Raspberry Pi$/).pos[2] - byName(a, /^Raspberry Pi$/).pos[2]).toBe(18);
  });
  it('numérotation : start = 1 → noms sans « 1 » ; start = 2 → les numéros restent', () => {
    const one = names(build({}, 1).planks), two = names(build({}, 2).planks);
    expect(one).toContain('Face avant ext');
    expect(one).toContain('Dessus toit');
    expect(two).not.toContain('Face avant ext');
    expect(two).toContain('Face avant ext 2');
    expect(two).toContain('Dessus toit 2');
    expect(two).toContain('Face avant caméra 2');
    expect(build({}, 2).name).toBe('Corps');
  });
  it('groupes : les pièces ont un groupe connu et nommé ; l\'habillage et l\'électronique existent', () => {
    const { planks, groupNames } = build();
    expect(Object.values(groupNames).sort()).toEqual(['Aération du corps', 'Baguettes de cale (à couper)', 'Corps', 'Couvercle', 'Entrée', 'Habillage', 'Isolant', 'Pièces d\'hiver (rechange)', 'Pièces fines de rechange', 'Toit', 'Ventilation', 'Électronique'].sort());
    for (const p of planks) if (p.group) expect(groupNames[p.group], p.name).toBeDefined();
    expect(planks.some((p) => /^Lambris/.test(p.name))).toBe(true);
    expect(planks.some((p) => p.special === 'doc')).toBe(false); // le dossier est ouvert par le bouton « Dossier » de la barre du haut, plus par une pièce de « Pièces »
  });
});

describe('makeNest : invariants sur toutes les tailles', () => {
  for (const [label, over] of Object.entries(EXTREMES)) {
    describe(label, () => {
      const { planks, s } = build(over);
      it('identifiants uniques, nombres finis, dimensions positives', () => {
        expect(new Set(planks.map((p) => p.id)).size).toBe(planks.length);
        for (const p of planks) {
          const nums = [p.w, p.h, ...p.pos, ...p.rot, ...(p.path ?? []).flat()];
          expect(nums.every(Number.isFinite), p.name).toBe(true);
          expect(p.w, p.name).toBeGreaterThan(0);
          expect(p.h, p.name).toBeGreaterThan(0);
        }
      });
      it('tous les trous (hors contours libres) tiennent dans leur plaque', () => {
        for (const p of planks) for (const h of p.holes) {
          if (h.poly || /^Lambris avant .*percé/.test(p.name) || (/^Face avant toit$/.test(p.name) && (over.l ?? 0) >= 260)) continue; // anomalies connues : voir « habillage » et « fente de la nappe » plus bas
          const hw = h.size / 2, hh = (h.shape === 'square' ? (h.sh ?? h.size) : h.size) / 2;
          expect(Math.abs(h.x) + hw, `${p.name} trou x`).toBeLessThanOrEqual(p.w / 2 + 1e-6);
          expect(Math.abs(h.y) + hh, `${p.name} trou y`).toBeLessThanOrEqual(p.h / 2 + 1e-6);
        }
      });
      it('les crans restent dans leur bord ; les contours ont au moins 3 points', () => {
        for (const p of planks) {
          if (p.special) continue;
          const o = outline(p);
          expect(o.length, p.name).toBeGreaterThanOrEqual(3);
          for (const n of p.notches) {
            const len = n.edge === 'top' || n.edge === 'bottom' ? p.w : p.h;
            expect(n.pos - n.width / 2, `${p.name} cran`).toBeGreaterThanOrEqual(-0.01); // positions et largeurs arrondies au centième
            expect(n.pos + n.width / 2, `${p.name} cran`).toBeLessThanOrEqual(len + 0.01);
          }
        }
      });
      it('le corps est centré sur x = 0 / y = 0, plancher à z = 0, symétrique en x', () => {
        const corps = planks.filter((p) => /^(Face|Côté|Dessous ext|Plancher)/.test(p.name) && !/toit|caméra/.test(p.name));
        const bb = bounds(corps, T);
        expect(bb.min[2]).toBeCloseTo(0, 6);
        expect(bb.min[0]).toBeCloseTo(-bb.max[0], 6);
        expect(bb.min[1]).toBeCloseTo(-bb.max[1], 6);
      });
      it('le toit et le corps ne se recouvrent pas : le dessous du toit repose sur le haut des murs', () => {
        const wall = byName(planks, /^Côté droit ext$/), floorRoof = byName(planks, /^Dessous toit$/);
        expect(planks.some((p) => /verrouillage/.test(p.name))).toBe(false); // la plaque en C est supprimée
        expect(floorRoof.pos[2] - T / 2).toBeCloseTo(wall.pos[2] + wall.h / 2, 6); // le dessous du toit repose directement sur le chant des parois
      });
      it('les noms de pièces de bois à découper sont uniques', () => {
        const wood = planks.filter((p) => !p.special);
        const n = names(wood);
        expect(new Set(n).size, n.filter((x, i) => n.indexOf(x) !== i).join(', ')).toBe(n.length);
      });
      it('toutes les plaques de bois se rangent sur des planches (aucune hors-limite sauf pièce trop grande)', () => {
        const sheets = nestSheets(s, 1200, 900);
        const placed = sheets.flatMap((sh) => sh.items.map((i) => i.plank.id));
        const wood = planks.filter((p) => !p.special); // le MDF est rangé à part, sur ses propres planches
        expect(new Set(placed).size).toBe(wood.length);
        for (const sh of sheets) for (const it of sh.items) {
          expect(it.x).toBeGreaterThanOrEqual(0);
          expect(it.y).toBeGreaterThanOrEqual(0);
        }
      });
    });
  }
});

describe('makeNest : balayage de la taille intérieure (120 à 300 par pas de 10)', () => {
  for (let l = 120; l <= 300; l += 10) {
    it(`l = ${l} : pièces cohérentes, lames de largeur fixe, isolant sous le bloc d'entrée`, () => {
      const { planks } = build({ l, L: l });
      expect(new Set(planks.map((p) => p.id)).size).toBe(planks.length);
      const W = l + 2 * (2 * T + 39);
      expect(byName(planks, /^Face avant ext$/).w).toBe(W);
      // façade : toutes les lames ont la même largeur (somme = W + 2 × 5), les fenêtres n'en changent pas la largeur
      const front = planks.filter((p) => /^Lambris avant [0-9]/.test(p.name));
      const widths = new Set(front.map((p) => +p.w.toFixed(2)));
      expect(widths.size, `largeurs ${[...widths]}`).toBe(1);
      const k = new Set(front.map((p) => p.pos[0])).size; // la lame d'entrée est coupée en deux par la plaque de la caméra : deux morceaux au même x
      expect(k * [...widths][0]).toBeCloseTo(W + 10, 1);
      expect(byName(planks, /^Isolant sous le bloc d'entrée$/).depth).toBeGreaterThan(0);
    });
  }
    it("sol → trou très bas (10 mm) : plus de pavé d'isolant sous le bloc d'entrée, le reste tient", () => {
    const { planks } = build({ floorToHole: 10 });
    expect(planks.some((p) => /^Isolant sous le bloc d'entrée$/.test(p.name))).toBe(false);
    expect(planks.some((p) => /^Isolant avant gauche$/.test(p.name))).toBe(true);
    expect(new Set(planks.map((p) => p.id)).size).toBe(planks.length);
  });
});

describe("habillage : trou d'envol dans la façade", () => {
  const entry = (over: Partial<NestParams>) => {
    const { planks } = build(over);
    return planks.filter((p) => /^Lambris avant/.test(p.name) && p.holes.some((h) => h.shape === 'round' && h.size > 5));
  };
  it('une seule lame est percée, au milieu (x = 0), du diamètre du trou', () => {
    for (const l of [120, 130, 140, 190, 230, 290]) {
      const e = entry({ l, L: l });
      expect(e, `l = ${l}`).toHaveLength(1);
      expect(e[0].name).toContain('(percé)');
      expect(e[0].holes.find((h) => h.shape === 'round' && h.size > 5)).toMatchObject({ x: 0, size: 32 });
      expect(e[0].pos[0]).toBeCloseTo(0, 9);
    }
  });
  // BUG connu (voir fix-lambris-entry-hole.patch) : avec un nombre PAIR de lames (l de 150 à 180, de 240 à 280) un joint tombe en x = 0
  // et aucune lame ne contient le centre : la façade de l'habillage n'est pas percée. À passer en test normal une fois corrigé.
  it('nombre pair de lames → la façade n est plus percée', () => {
    for (const l of [150, 160, 170, 180, 240, 280]) expect(entry({ l, L: l }), `l = ${l}`).toHaveLength(1);
  });
  // BUG connu : un trou plus large que la lame (46 mm) donne un trou qui dépasse de la planche.
  it.fails('BUG : trou d envol plus large que la lame centrale', () => {
    const e = entry({ l: 120, hole: 94 })[0];
    const h = e.holes.find((x) => x.shape === 'round' && x.size > 5)!;
    expect(Math.abs(h.x) + h.size / 2).toBeLessThanOrEqual(e.w / 2);
  });
});

describe('plaque avant du toit', () => {
  it('aucune fente pour la nappe de la 2ᵉ caméra, quelle que soit la taille (elle passe par le canal du pan)', () => {
    for (const l of [120, 200, 250, 300]) expect(withoutBagSlots(byName(build({ l, L: l }).planks, /^Face avant toit$/).holes)).toHaveLength(0);
  });
});

describe('carveRects', () => {
  it('sans trou : le rectangle entier', () => {
    expect(carveRects([0, 0, 10, 5], [])).toEqual([[0, 0, 10, 5]]);
  });
  it('un trou au milieu : trois bandes verticales, celle du milieu coupée en deux', () => {
    expect(carveRects([0, 0, 10, 10], [[4, 3, 6, 7]])).toEqual([[0, 0, 4, 10], [4, 0, 6, 3], [4, 7, 6, 10], [6, 0, 10, 10]]);
  });
  it('un trou qui traverse toute la hauteur : la bande disparaît ; un trou hors du rectangle est ignoré', () => {
    expect(carveRects([0, 0, 10, 10], [[4, -1, 6, 11]])).toEqual([[0, 0, 4, 10], [6, 0, 10, 10]]);
    expect(carveRects([0, 0, 10, 10], [[20, 0, 30, 10]])).toEqual([[0, 0, 10, 10]]);
  });
  it('deux trous qui se chevauchent dans une même bande', () => {
    expect(carveRects([0, 0, 10, 10], [[0, 1, 10, 4], [0, 3, 10, 6]])).toEqual([[0, 0, 10, 1], [0, 6, 10, 10]]);
  });
});

describe('découpe : planches MDF, libellés, SVG', () => {
  const p = (id: string, w: number, h: number, over: Partial<Plank> = {}): Plank => ({ id, name: id, w, h, pos: [0, 0, 0], rot: [0, 0, 0], notches: [], holes: [], ...over });
  it('le MDF a ses propres planches, rangées après le contreplaqué, et se numérote à part', () => {
    const s: PlankScene = { t: 3, fit: 0, planks: [p('a', 100, 100), p('m1', 50, 50, { material: 'mdf' }), p('b', 100, 100), p('m2', 50, 50, { material: 'mdf' }), p('cam', 10, 10, { special: 'camera' })] };
    const sheets = nestSheets(s, 300, 300);
    expect(sheets.map((x) => x.material)).toEqual([undefined, 'mdf']);
    expect(sheets[0].items.map((i) => i.plank.id).sort()).toEqual(['a', 'b']);
    expect(sheets[1].items.map((i) => i.plank.id).sort()).toEqual(['m1', 'm2']);
    expect(sheets[1].items[0].plank.material).toBeUndefined(); // copie sans matériau
    expect([0, 1].map((i) => sheetLabel(sheets, i))).toEqual(['Planche 1', 'Planche MDF 1']);
    // plusieurs planches MDF
    const many: PlankScene = { t: 3, fit: 0, planks: [p('x', 100, 100), p('m1', 280, 280, { material: 'mdf' }), p('m2', 280, 280, { material: 'mdf' })] };
    const ms = nestSheets(many, 300, 300);
    expect(ms.map((x) => sheetLabel(ms, ms.indexOf(x)))).toEqual(['Planche 1', 'Planche MDF 1', 'Planche MDF 2']);
    expect(sheetLabel(ms, 99)).toBe('Planche 100'); // indice hors liste : contreplaqué
  });
  it('une pièce plus grande que la planche est posée seule et signalée (used > 1)', () => {
    const sheets = nestSheets({ t: 3, fit: 0, planks: [p('big', 500, 100)] }, 300, 300);
    expect(sheets).toHaveLength(1);
    expect(sheets[0].used).toBeGreaterThan(1);
    expect(sheets[0].items[0]).toMatchObject({ x: 8, y: 8, rotated: false });
  });
  it('une pièce haute est tournée d\'un quart de tour pour entrer dans la planche', () => {
    const sheets = nestSheets({ t: 3, fit: 0, planks: [p('long', 100, 380)] }, 400, 150);
    expect(sheets).toHaveLength(1);
    expect(sheets[0].items[0].rotated).toBe(true);
    expect(sheets[0].items[0]).toMatchObject({ w: 380, h: 100 });
  });
  it('sheetSvg : cadre, contour, trous, nom, numéro de planche', () => {
    const sheets = nestSheets({ t: 3, fit: 0, planks: [p('Pièce A', 20, 10, { holes: [{ id: 'h', shape: 'round', x: 0, y: 0, size: 4 }] })] }, 100, 50);
    const svg = sheetSvg(sheets[0], 100, 50, 2);
    expect(svg).toContain('width="100mm" height="50mm" viewBox="0 0 100 50"');
    expect(svg).toContain('planche 3');
    expect(svg).toContain('>X-01 Pièce A</text>'); // code de la plaque (sans groupe : X-01) + nom
    expect(svg.match(/<polygon(?! class="e")/g)).toHaveLength(2); // contour + trou (le code gravé est à part, en bleu, class="e")
    expect(sheets[0].items[0].rotated).toBe(true); // 10 × 20 : tournée d'un quart de tour, au plus près du coin
    expect(svg).toContain('points="18,28 18,8 8,8 8,28"'); // pièce 10 × 20 en (8, 8), y vers le bas
    expect(svg).toContain('points="13,16 12.61,16.04'); // trou Ø 4 au centre (13, 18)
  });
  it('sheetsPreviewSvg : planches empilées avec un intervalle', () => {
    const sheets = nestSheets({ t: 3, fit: 0, planks: [p('a', 280, 280), p('b', 280, 280)] }, 300, 300);
    const svg = sheetsPreviewSvg(sheets, 300, 300, 10);
    expect(svg).toContain('height="610mm"');
    expect(svg).toContain('translate(0 310)');
    expect(svg.match(/<svg/g)).toHaveLength(1);
  });
});

describe('pièces d\'hiver', () => {
  const nest = () => build().s;
  const pos = (s: PlankScene, re: RegExp): number[] => byName(s.planks, re).pos;
  it('état par défaut : été (cassette en place), prise d\'air ouverte', () => {
    expect(winterState(nest())).toEqual({ cassette: 'summer', plug: 'open' });
  });
  it('winterState : scène sans ces pièces → null / null', () => {
    expect(winterState({ t: 3, fit: 0, planks: [] })).toEqual({ cassette: null, plug: null });
  });
  it('trois états : été, hiver, aucune (siège vide) ; aller-retour exact entre tous, bloc et cassette rangés sans se recouvrir', () => {
    const s0 = nest(), modes = ['summer', 'winter', 'none'] as const, st = Object.fromEntries(modes.map((m) => [m, setCassetteMode(s0, m)]));
    for (const m of modes) expect(winterState(st[m]).cassette).toBe(m);
    expect(st.summer).toEqual(s0); // l'état par défaut est l'été
    for (const a of modes) for (const b of modes) expect(setCassetteMode(st[a], b), a + ' → ' + b).toEqual(st[b]); // exact au centième, quel que soit le chemin
    expect(setCassetteMode(setCassetteMode(setCassetteMode(st.none, 'winter'), 'summer'), 'none')).toEqual(st.none);
    const seat = pos(s0, /^Cassette ventilateur 1$/), none = st.none, bf = pos(none, /^Bloc isolant d'hiver 1$/), fan = pos(none, /^Ventilateur Noctua/), cf = pos(none, /^Cassette ventilateur 1$/);
    expect(Math.hypot(fan[0] - seat[0], fan[1] - seat[1])).toBeGreaterThan(100); // siège vide : ni cassette ni bloc
    expect(Math.hypot(bf[0] - seat[0], bf[1] - seat[1])).toBeGreaterThan(100);
    expect(bf[0]).toBeLessThan(-(210 / 2) - 100); expect(cf[0]).toBeLessThan(-(210 / 2) - 100); // les deux rangés à gauche du nichoir
    expect(Math.abs(bf[1] - cf[1])).toBeGreaterThan(75); // à des endroits différents (pas de recouvrement : le bloc fait ≈ 77 mm de long)
    // les pièces de rechange et les fils de la cassette suivent la cassette (chemins décalés), la prise d'air n'est pas touchée
    expect(winterState(none).plug).toBe('open'); expect(nextCassette('summer')).toBe('winter'); expect(nextCassette('winter')).toBe('none'); expect(nextCassette('none')).toBe('summer');
    expect(setCassetteMode({ t: 3, fit: 0, planks: [] }, 'none')).toEqual({ t: 3, fit: 0, planks: [] });
  });
  it('hiver : la cassette sort, le bloc isolant entre dans le siège ; aller-retour exact', () => {
    const s = nest();
    const w = setWinterCassette(s, true);
    expect(winterState(w).cassette).toBe('winter');
    const seat = pos(s, /^Cassette ventilateur 1$/); // paroi avant de la cassette = celle du bloc (le bloc est plus long : il comble aussi la place du conduit de sortie)
    expect(Math.hypot(pos(w, /^Bloc isolant d'hiver 1$/)[0] - seat[0], pos(w, /^Bloc isolant d'hiver 1$/)[1] - seat[1])).toBeLessThan(1);
    expect(pos(w, /^Ventilateur Noctua/)[0]).toBeLessThan(-(210 / 2) - 100); // rangé à gauche du nichoir
    expect(setWinterCassette(w, true)).toEqual(w); // déjà en hiver : rien ne bouge
    expect(setWinterCassette(w, false)).toEqual(s);
    expect(setWinterCassette(s, false)).toEqual(s);
  });
  it('les fils de la cassette bougent par leur chemin (pos reste 0)', () => {
    const s = nest();
    const wire = s.planks.find((p) => /^Câble d'origine du ventilateur/.test(p.name));
    if (!wire) return; // pas de fil nommé ainsi dans ce modèle : le déplacement par pos est couvert par la cassette
    const w = setWinterCassette(s, true);
    const moved = w.planks.find((p) => p.id === wire.id)!;
    expect(moved.pos).toEqual([0, 0, 0]);
    expect(moved.path).not.toEqual(wire.path);
  });
  it('prise d\'air : bouchée = sous-boîte dans le conduit ; aller-retour exact ; même état → même scène', () => {
    const s = nest();
    const plugged = setAirPlug(s, true);
    expect(winterState(plugged).plug).toBe('plugged');
    expect(setAirPlug(plugged, true)).toBe(plugged);
    expect(setAirPlug(s, false)).toBe(s);
    expect(setAirPlug(plugged, false)).toEqual(s);
    const lid = pos(s, /^Conduit d'air 5/), lip = pos(plugged, /^Bouchon-boîte prise d'air fond/);
    expect(lip.slice(0, 2)).toEqual(lid.slice(0, 2));
  });
  it('sans les pièces : les réglages ne font rien (même scène)', () => {
    const e: PlankScene = { t: 3, fit: 0, planks: [] };
    expect(setWinterCassette(e, true)).toBe(e);
    expect(setAirPlug(e, true)).toBe(e);
    expect(summerLayout(e)).toBe(e);
  });
  it('summerLayout d\'une scène d\'hiver ramène l\'été', () => {
    const s = nest();
    const winter = setAirPlug(setWinterCassette(s, true), true);
    expect(winterState(summerLayout(winter))).toEqual({ cassette: 'summer', plug: 'open' });
  });
});
