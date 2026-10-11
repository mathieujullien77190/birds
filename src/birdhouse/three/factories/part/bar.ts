import { BoxGeometry, Color } from 'three';
import type { Plank } from '../../../model';
import { PALETTE } from '../../registry/palette';
import { coloredPart, type PartGeometry } from '../geometry';

/** Barre de bois : longueur w, largeur h, épaisseur du bois. */
export function barGeometry(p: Plank, t: number): PartGeometry {
  return coloredPart([{ g: new BoxGeometry(p.w, p.h, t), c: new Color(PALETTE.woodBar) }]);
}
