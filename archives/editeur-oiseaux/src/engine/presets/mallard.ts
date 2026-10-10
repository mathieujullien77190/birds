import type { Part } from '../types';

export type PartDef = Omit<Part, 'id'>;

/**
 * Canard colvert mâle, posé (corps = œuf couché, gros bout devant). Proportions et couleurs : voir docs/colvert.md
 * (corps = 1.7 unité de long ; tête ≈ 0.27 du corps, bec ≈ 0.17, aile ≈ 0.75, queue ≈ 0.18, relevée ≈ 25°).
 * Repère : X = droite, Y = avant, Z = haut. Le corps est à z ≈ 0.55. Les couleurs sont adoucies au rendu (style Alba).
 * detail: 99 = « au maximum » : clampDetail() le ramène au DETAIL_MAX de la forme ; on baisse le nombre de triangles à la main si besoin.
 */
export const MALLARD_MALE: PartDef[] = [
  { shape: 'body', name: 'Corps', pos: [0, 0, 0.55], rot: [0, 0, 0], scl: [0.84, 1.05, 0.82], yStretch: [1, 1], color: '#d2cfc6', detail: 99, smooth: true, mirror: false, transparent: true, showAxes: true },
  { shape: 'head', name: 'Tête', pos: [0, 0.72, 0.98], rot: [0, 0, 0], scl: [0.85, 0.85, 0.85], yStretch: [1, 1], color: '#2e7a52', detail: 99, smooth: true, mirror: false, transparent: true, showAxes: true },
  { shape: 'bill', name: 'Bec', pos: [0, 0.92, 0.93], rot: [6, 0, 0], scl: [0.65, 0.95, 1], yStretch: [1, 1], color: '#f0b429', detail: 99, smooth: true, mirror: false, transparent: true, showAxes: true },
  { shape: 'eye', name: 'Œil', pos: [0.23, 0.82, 1.04], rot: [0, 0, 0], scl: [1.2, 1.2, 1.2], yStretch: [1, 1], color: '#141414', detail: 99, smooth: true, mirror: true, transparent: true, showAxes: true },
  { shape: 'wing', name: 'Aile', pos: [0.38, -0.1, 0.68], rot: [0, -14, 0], scl: [1, 1.25, 0.9], yStretch: [1, 1], color: '#9a8f80', detail: 99, smooth: true, mirror: true, transparent: true, showAxes: true },
  { shape: 'tail', name: 'Queue', pos: [0, -0.78, 0.68], rot: [-25, 0, 0], scl: [1.4, 0.9, 1.6], yStretch: [1, 1], color: '#22252a', detail: 99, smooth: true, mirror: false, transparent: true, showAxes: true },
];
