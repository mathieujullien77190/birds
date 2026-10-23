import { describe, expect, it } from 'vitest';
import { applyH, distort, squareToQuad, type Pt } from '../src/components/Webcam/homography';
import { DEFAULT_CALIBRATION, parseCalibration } from '../src/components/Webcam/calibration';

const near = (a: Pt, b: Pt) => { expect(a[0]).toBeCloseTo(b[0], 9); expect(a[1]).toBeCloseTo(b[1], 9); };

describe('squareToQuad', () => {
  it('envoie les coins du carré sur ceux du quadrilatère (perspective)', () => {
    const q: [Pt, Pt, Pt, Pt] = [[0.2, 0.1], [0.8, 0.2], [0.95, 0.9], [0.05, 0.8]];
    const m = squareToQuad(q);
    near(applyH(m, 0, 0), q[0]); near(applyH(m, 1, 0), q[1]); near(applyH(m, 1, 1), q[2]); near(applyH(m, 0, 1), q[3]);
  });
  it('cas affine (parallélogramme) et identité', () => {
    near(applyH(squareToQuad([[0, 0], [1, 0], [1, 1], [0, 1]]), 0.3, 0.7), [0.3, 0.7]);
    near(applyH(squareToQuad([[0.1, 0.1], [0.6, 0.1], [0.7, 0.6], [0.2, 0.6]]), 1, 1), [0.7, 0.6]);
  });
  it('garde les lignes droites : le milieu du bord haut reste sur le bord haut', () => {
    const q: [Pt, Pt, Pt, Pt] = [[0.2, 0.1], [0.8, 0.2], [0.95, 0.9], [0.05, 0.8]];
    const [x, y] = applyH(squareToQuad(q), 0.5, 0);
    expect((y - q[0][1]) * (q[1][0] - q[0][0])).toBeCloseTo((x - q[0][0]) * (q[1][1] - q[0][1]), 9);
  });
});

describe('distort', () => {
  it('ne bouge pas le centre ni, avec k1 = 0, aucun point', () => {
    near(distort([0.5, 0.5], -0.3, 16 / 9), [0.5, 0.5]);
    near(distort([0.9, 0.2], 0, 16 / 9), [0.9, 0.2]);
  });
  it('k1 < 0 ramène les bords vers le centre', () => {
    expect(distort([0.9, 0.5], -0.3, 1)[0]).toBeLessThan(0.9);
  });
});

describe('parseCalibration', () => {
  it('rend les valeurs par défaut pour un texte absent ou invalide', () => {
    expect(parseCalibration(null)).toEqual(DEFAULT_CALIBRATION);
    expect(parseCalibration('pas du json')).toEqual(DEFAULT_CALIBRATION);
  });
  it('borne les valeurs et relit un réglage valide', () => {
    const c = parseCalibration(JSON.stringify({ k1: 9, corners: [[2, -1], [0.8, 0.1], [0.9, 0.9], [0.1, 0.9]], refW: 300, refH: 1, flat: true, grid: false }));
    expect(c.k1).toBe(1); expect(c.corners[0]).toEqual([1, 0]); expect(c.refW).toBe(300); expect(c.refH).toBe(10); expect(c.flat).toBe(true); expect(c.grid).toBe(false);
  });
});
