import { describe, expect, it } from 'vitest';
import type { Plank } from '@/birdhouse/model';
import { nestSheets, sheetLabel } from '@/birdhouse/model';
import { VARIANTS, buildNest } from './helpers';
import { aabb, gap } from './geomChecks';
import { ligament } from './geomLigament';

const sc0 = buildNest({}), t = sc0.t;
const by = (re: RegExp, sc = sc0) => sc.planks.filter((p) => re.test(p.name));
const one = (re: RegExp) => { const r = by(re); expect(r, String(re)).toHaveLength(1); return r[0]; };
const FACES = [{ nm: 'avant', axis: 0 as const }, { nm: 'arrière', axis: 0 as const }, { nm: 'gauche', axis: 1 as const }, { nm: 'droite', axis: 1 as const }];

describe('tourniquets du toit (MDF) à la place des barres', () => {
  it('quatre tourniquets MDF 3 mm, 44 × 14, pivot Ø 4 ; plus aucune barre ni trou 10 × t ni encoche de 10 × 47', () => {
    const tq = by(/^Tourniquet toit \d \(MDF 3 mm\)$/); expect(tq).toHaveLength(4);
    for (const q of tq) { expect(q.material).toBe('mdf'); expect(q.special).toBeUndefined(); expect([q.w, q.h]).toEqual([44, 14]); expect(q.holes).toHaveLength(1); expect(q.holes[0]).toMatchObject({ shape: 'round', size: 4, x: 0, y: 0 }); expect(ligament(q, q.holes[0]).min).toBeGreaterThanOrEqual(4.5 - 1e-6); expect(q.poly!.length).toBeGreaterThan(12); } // barrette à bouts ronds
    expect(by(/^Barre /)).toEqual([]);
    for (const w of by(/^Face (avant|arrière) ext/)) expect(w.holes.filter((h) => h.size === 10 && h.sh === t), w.name).toEqual([]);
    expect(one(/^Cadre toit milieu/).notches).toHaveLength(1); // seulement l'ouverture en U : plus d'encoches de 10 × 47
    expect(by(/^Cadre toit (haut|milieu|bas)$/)).toHaveLength(3); // le cadre en trois planches reste
    expect(by(/^Appui tourniquet \d$/)).toHaveLength(4); expect(by(/^Patte toit \d$/)).toHaveLength(4); expect(by(/^Vis tourniquet \d/)).toHaveLength(4);
  });
  it('visibles par défaut (ni cachés ni pièces de rechange)', async () => {
    const { HIDDEN_AT_CREATION } = await import('@/features/viewer/constants');
    for (const p of by(/(Tourniquet|Appui tourniquet|Patte toit|Vis tourniquet)/)) expect(HIDDEN_AT_CREATION.some((re) => re.test(p.name)), p.name).toBe(false);
  });
  it('pivot dans l appui, vis sur le pivot, et le tourniquet verrouillé passe au-dessus de la patte (recouvrement ≥ 6 mm), déverrouillé il la dégage', () => {
    for (const [k, f] of FACES.entries()) {
      const tq = one(new RegExp(`^Tourniquet toit ${k + 1} `)), ap = aabb(one(new RegExp(`^Appui tourniquet ${k + 1}$`)), t), pa = aabb(one(new RegExp(`^Patte toit ${k + 1}$`)), t), vis = one(new RegExp(`^Vis tourniquet ${k + 1} `));
      const a = aabb(tq, t), ax = f.axis, ay = 1 - ax, pz = tq.pos[2];
      expect(tq.pos[ax], f.nm + ' pivot centré sur l appui').toBeCloseTo((ap.min[ax === 0 ? 'x' : 'y'] + ap.max[ax === 0 ? 'x' : 'y']) / 2, 1);
      expect(pz).toBeGreaterThan(ap.min.z); expect(pz).toBeLessThan(ap.max.z); // pivot dans la hauteur de l appui
      expect(vis.pos[ax]).toBeCloseTo(tq.pos[ax], 2); expect(vis.pos[2]).toBeCloseTo(pz, 2);
      const ka = ax === 0 ? 'x' : 'y', kn = ay === 0 ? 'x' : 'y';
      const over = Math.min(a.max[ka], pa.max[ka]) - Math.max(a.min[ka], pa.min[ka]); expect(over, f.nm + ' recouvrement tangent').toBeGreaterThanOrEqual(6); // 11 mm dans le modèle
      expect(pa.max.z, f.nm + ' la patte sous le tourniquet').toBeLessThanOrEqual(a.min.z + 0.01); expect(a.min.z - pa.max.z).toBeLessThan(1.01); // jeu ≤ 1 mm : le toit ne peut presque pas monter
      const lay = Math.min(a.max[kn], pa.max[kn]) - Math.max(a.min[kn], pa.min[kn]); expect(lay, f.nm + ' même couche').toBeGreaterThanOrEqual(2); // le tourniquet et la patte se touchent dans l épaisseur
      const pivotT = tq.pos[ax], half = tq.h / 2; // déverrouillé : le tourniquet vertical occupe pivot ± 7 en tangent, la patte commence plus loin
      const dist = Math.min(Math.abs(pa.min[ka] - pivotT), Math.abs(pa.max[ka] - pivotT)); expect(dist, f.nm + ' dégagement déverrouillé').toBeGreaterThan(half);
      expect(ap.max.z - ap.min.z).toBeGreaterThan(40); expect(ap.min.z).toBeLessThan(one(/^Face avant ext/).pos[2] + 150); // l appui est collé en bas sur le mur du corps
    }
  });
  it('fenêtres de l habillage : aucune lamelle de moins de 5 mm, aucun chevauchement, rien de l arrière-plan ne gêne les tourniquets', () => {
    const lam = by(/^Lambris /);
    for (const l of lam) { const b = aabb(l, t); const dims = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].sort((p, q) => p - q); expect(dims[0], l.name).toBeGreaterThan(9.99); expect(dims[1], l.name + " largeur").toBeGreaterThanOrEqual(5); }
    for (let i = 0; i < lam.length; i++) for (let j = i + 1; j < lam.length; j++) expect(gap(aabb(lam[i], t), aabb(lam[j], t)), lam[i].name + ' / ' + lam[j].name).toBeGreaterThanOrEqual(-0.01);
    for (const q of by(/^(Tourniquet toit|Appui tourniquet|Vis tourniquet)/)) { const b = aabb(q, t); for (const l of lam) { if (!/^Lambris (avant|arrière|droite|gauche)/.test(l.name)) continue; const lb = aabb(l, t); const ov = [Math.min(b.max.x, lb.max.x) - Math.max(b.min.x, lb.min.x), Math.min(b.max.y, lb.max.y) - Math.max(b.min.y, lb.min.y), Math.min(b.max.z, lb.max.z) - Math.max(b.min.z, lb.min.z)]; if (ov.every((v) => v > 0.05)) { const cx = (b.min.x + b.max.x) / 2, cy = (b.min.y + b.max.y) / 2; expect(true, `${q.name} dans ${l.name} (${cx.toFixed(0)}, ${cy.toFixed(0)})`).toBe(false); } } }
  });
  it('les fenêtres tombent dans la bande des fenêtres arrière sans la déranger (les lames arrière s arrêtent toujours au même niveau)', () => {
    const l3 = by(/^Lambris arrière 3/); expect(l3).toHaveLength(2);
    const win = aabb(l3[0], t).max.z, up = aabb(l3[1], t).min.z; expect(up).toBeGreaterThan(win + 40); // une seule grande fenêtre dans la lame du milieu : tourniquet + sortie
  });
  it('le MDF a ses propres planches : quatre tourniquets, aucune pièce de contreplaqué dessus, libellé « Planche MDF »', () => {
    const sheets = nestSheets(sc0, 410, 400);
    const mdf = sheets.filter((s) => s.material === 'mdf'), ply = sheets.filter((s) => s.material !== 'mdf');
    expect(mdf).toHaveLength(1); expect(mdf[0].items.map((i) => i.plank.name).sort()).toEqual([1, 2, 3, 4].map((k) => `Tourniquet toit ${k} (MDF 3 mm)`));
    for (const s of ply) for (const i of s.items) expect(i.plank.material, i.plank.name).toBeUndefined();
    expect(sheets.indexOf(mdf[0])).toBe(sheets.length - 1); // après les planches de contreplaqué
    expect(sheetLabel(sheets, sheets.length - 1)).toBe('Planche MDF 1'); expect(sheetLabel(sheets, 0)).toBe('Planche 1');
    const count = (p: Plank[]) => p.length; expect(count(sc0.planks.filter((p) => p.material === 'mdf'))).toBe(4);
    for (const over of Object.values(VARIANTS)) { const s = nestSheets(buildNest(over), 410, 400); expect(s.filter((x) => x.material === 'mdf').flatMap((x) => x.items)).toHaveLength(4); }
  });
});
