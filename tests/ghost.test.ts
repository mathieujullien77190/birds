import { describe, expect, it } from 'vitest';
import { GHOST, fadeOpacity, ghostTarget, isGhostPart } from '@/birdhouse/three/ghost';

describe('cassette fantôme (désactivée)', () => {
  it("l'opacité cible reste 1 que le ventilateur tourne ou non : la cassette ne change pas", () => {
    expect(GHOST.opacity).toBe(1);
    expect(ghostTarget(0)).toBe(1); expect(ghostTarget(1)).toBe(1); expect(ghostTarget(80)).toBe(1);
  });
  it('le fondu ne bouge pas quand la cible est 1', () => {
    expect(fadeOpacity(1, 1, 0.5)).toBe(1);
  });
  it('les pièces de la cassette sont toujours reconnues par leur nom (pour une réactivation éventuelle)', () => {
    expect(isGhostPart('Cassette ventilateur 1')).toBe(true);
    expect(isGhostPart('Bloc isolant d\'hiver 1')).toBe(false);
  });
});
