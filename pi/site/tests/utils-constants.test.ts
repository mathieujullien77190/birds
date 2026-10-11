import { describe, expect, it } from 'vitest';
import { fmt } from '@/utils';
import { CAPACITE_WH, INJOIGNABLE, PERIODE, VITESSE_DEFAUT, VITESSE_MIN } from '@/constants';

describe('fmt', () => {
  it('affiche le nombre', () => { expect(fmt(24.5)).toBe('24.5'); });
  it("garde le zéro (0 n'est pas « manquant »)", () => { expect(fmt(0)).toBe('0'); });
  it('affiche un tiret pour null et undefined', () => {
    expect(fmt(null)).toBe('—');
    expect(fmt(undefined)).toBe('—');
  });
});

describe('constantes', () => {
  it('valeurs attendues (alignées sur le Python)', () => {
    expect(PERIODE).toBe(5000);
    expect(VITESSE_MIN).toBe(30);
    expect(VITESSE_DEFAUT).toBe(60);
    expect(VITESSE_DEFAUT).toBeGreaterThanOrEqual(VITESSE_MIN);
    expect(INJOIGNABLE).toBe('programme injoignable');
    expect(CAPACITE_WH).toBe(76.8);
  });
});
