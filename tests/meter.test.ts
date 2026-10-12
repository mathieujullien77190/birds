import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { formatMm, meterReading } from '@/birdhouse/three/interactions/meter';
import { meterText } from '@/features/viewer/components/MeterBar/helpers';

describe('mètre ruban', () => {
  it('distance et écarts par axe entre deux points', () => {
    const r = meterReading(new Vector3(0, 0, 0), new Vector3(30, -40, 0), true);
    expect(r.mm).toBeCloseTo(50, 9);
    expect([r.dx, r.dy, r.dz]).toEqual([30, 40, 0]);
    expect(r.done).toBe(true);
    expect(meterReading(new Vector3(1, 2, 3), new Vector3(1, 2, 3), false).mm).toBe(0);
  });
  it('un chiffre après la virgule, virgule française', () => {
    expect(formatMm(123.456)).toBe('123,5 mm');
    expect(formatMm(210)).toBe('210 mm');
    expect(formatMm(0)).toBe('0 mm');
  });
  it('texte du bandeau : consigne, mesure en cours, mesure terminée', () => {
    expect(meterText(null)).toContain('premier point');
    expect(meterText({ mm: 12.34, dx: 12.34, dy: 0, dz: 0, done: false })).toBe('12,3 mm … clique le second point');
    expect(meterText({ mm: 50, dx: 30, dy: 40, dz: 0, done: true })).toBe('Distance : 50 mm');
  });
});
