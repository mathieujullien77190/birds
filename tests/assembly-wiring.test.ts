import { describe, expect, it } from 'vitest';
import { PIN_NAMES, assemblySteps, pinLabel, wireInfo, wiringText } from '@/birdhouse/model';
import { buildNest } from './helpers';

describe('montage : le câblage cite le nom des broches du Pi', () => {
  const sc = buildNest({}), steps = assemblySteps(sc);
  it('les 40 broches ont un nom ; masses, 5 V et 3,3 V aux bons endroits', () => {
    expect(Object.keys(PIN_NAMES)).toHaveLength(40);
    for (const g of [6, 9, 14, 20, 25, 30, 34, 39]) expect(PIN_NAMES[g]).toMatch(/GND/);
    for (const v of [2, 4]) expect(PIN_NAMES[v]).toBe('5 V'); for (const v of [1, 17]) expect(PIN_NAMES[v]).toBe('3,3 V');
    expect(pinLabel(12)).toBe('broche 12 (GPIO18, PWM)'); expect(pinLabel(7)).toBe('broche 7 (GPIO4, 1-Wire)'); expect(pinLabel(11)).toBe('broche 11 (GPIO17, tachymètre)');
  });
  it('chaque étape de câblage dit d’où à où va chaque fil ; celles qui touchent le Pi nomment leurs broches', () => {
    const wiring = steps.filter((s) => s.kind === 'cabler');
    expect(wiring.length).toBeGreaterThan(20);
    let withPins = 0;
    for (const st of wiring) {
      const wires = st.pieceIds.map((id) => sc.planks.find((p) => p.id === id)!).filter((p) => wireInfo(p, sc.planks)?.known);
      for (const w of wires) {
        expect(st.text, `${st.id} ${w.name}`).toContain(`${w.name} : `);
        const pins = wireInfo(w, sc.planks)!.pins;
        for (const n of pins) { expect(st.text, `${st.id} ${w.name}`).toContain(pinLabel(n)); withPins++; }
      }
    }
    expect(withPins).toBeGreaterThanOrEqual(12);
  });
  it('exemples : PWM du ventilateur = broche 12 (GPIO18, PWM), sonde = broches 7, 17, 20, capteur = 1, 3, 5, 9 ; wiringText vide hors fils', () => {
    const text = (re: RegExp) => steps.find((s) => s.pieceIds.some((id) => re.test(sc.planks.find((p) => p.id === id)!.name)))!.text ?? '';
    expect(text(/^Fil PWM ventilateur/)).toContain('broche 12 (GPIO18, PWM)');
    expect(text(/^Fil sonde DATA/)).toContain('broche 7 (GPIO4, 1-Wire)');
    expect(text(/^Fil sonde masse/)).toContain('broche 20 (GND (masse))');
    expect(wiringText(sc.planks, [sc.planks.find((p) => /^Face avant ext$/.test(p.name))!.id])).toBe('');
  });
  it('cas limites : fil inconnu, identifiant absent, fil sans broche du Pi, étape de câblage sans texte de règle', () => {
    const ghost = { ...sc.planks.find((p) => /^Fil PWM ventilateur/.test(p.name))!, id: 'x', name: 'Fil inconnu' };
    expect(wiringText([...sc.planks, ghost], ['x'])).toBe(''); // pas dans la table : rien d'inventé
    expect(wiringText(sc.planks, ['absent'])).toBe('');
    const wago = sc.planks.find((p) => /^Fil rail → convertisseur \+/.test(p.name))!;
    const t1 = wiringText(sc.planks, [wago.id]); expect(t1).toContain('→'); expect(t1).not.toContain('Broches du Pi'); expect(t1).toContain('Raccord');
    expect(pinLabel(99)).toBe('broche 99 (?)');
    const noText = steps.filter((s) => s.kind === 'cabler' && s.pieceIds.length && !s.text); expect(noText).toEqual([]);
  });
});
