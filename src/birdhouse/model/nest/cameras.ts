import type { Plank } from '../types';

/** Noms des deux cartes caméra du nichoir (`special = 'camera'`) : 0 = dans le nid, 1 = dehors. Une seule source pour `makeNest` et le simulateur du Pi. */
export const CAMERA_NAMES = ['Caméra', 'Caméra 2'] as const;

/** La carte caméra `index` (0 = nid, 1 = dehors), ou `undefined` si elle n'existe pas (option « 2ᵉ caméra » retirée, par exemple). */
export function findCameraPlank(planks: readonly Plank[], index: 0 | 1): Plank | undefined {
  return planks.find((p) => p.special === 'camera' && p.name === CAMERA_NAMES[index]);
}
