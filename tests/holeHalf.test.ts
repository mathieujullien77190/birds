import { describe, expect, it } from 'vitest';
import { holeHalf, holeOutline, type Hole } from '@/birdhouse/model';

const rect: Hole = { id: 'r', shape: 'square', x: 5, y: -3, size: 20, sh: 12 };

describe('demi-dimensions d\'un trou (cotes des repères)', () => {
  it('rond : le rayon des deux côtés', () => { expect(holeHalf({ id: 'c', shape: 'round', x: 0, y: 0, size: 10 })).toEqual([5, 5]); });
  it('rectangle : size / 2 en largeur, sh / 2 en hauteur (ce n\'est pas un bug : la ternaire redondante des repères donnait déjà ça)', () => {
    expect(holeHalf(rect)).toEqual([10, 6]);
  });
  it('rectangle sans sh : carré', () => { expect(holeHalf({ ...rect, sh: undefined })).toEqual([10, 10]); });
  it('colle au contour réel du trou', () => {
    const xs = holeOutline(rect).map(([x]) => x), ys = holeOutline(rect).map(([, y]) => y);
    const [hw, hh] = holeHalf(rect);
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([rect.x - hw, rect.x + hw, rect.y - hh, rect.y + hh]);
  });
});
