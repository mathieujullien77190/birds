import { describe, expect, it } from 'vitest';
import { CAMERA_NAMES, findCameraPlank } from '@/birdhouse/model';
import { buildNest } from './helpers';

describe('cartes caméra du nichoir', () => {
  it('le nichoir complet a ses deux cartes, sous les noms partagés', () => {
    const { planks } = buildNest({});
    expect(findCameraPlank(planks, 0)?.name).toBe(CAMERA_NAMES[0]);
    expect(findCameraPlank(planks, 1)?.name).toBe(CAMERA_NAMES[1]);
    expect(planks.filter((p) => p.special === 'camera').length).toBe(2);
  });
  it('sans 2ᵉ caméra : seulement celle du nid', () => {
    const { planks } = buildNest({ cam2: false });
    expect(findCameraPlank(planks, 0)).toBeDefined();
    expect(findCameraPlank(planks, 1)).toBeUndefined();
  });
  it('une plaque qui porte le même nom sans être une carte caméra n\'est pas prise', () => {
    const { planks } = buildNest({});
    const imposter = { ...planks[0], name: CAMERA_NAMES[0], special: undefined };
    expect(findCameraPlank([imposter], 0)).toBeUndefined();
  });
});
