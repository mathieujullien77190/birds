import type { NestParams } from '@/birdhouse/model';

/** Dimensions extérieures annoncées sur le bouton « Créer le nichoir » : largeur, profondeur, hauteur (mm). */
export function nestOuterSize(nest: NestParams, t: number): [number, number, number] {
  const wall = 2 * (2 * t + nest.ins);
  return [nest.l + wall, nest.L + wall, nest.floorToHole + nest.hole + nest.above + 2 * t + 2 * (t + nest.ins)];
}
