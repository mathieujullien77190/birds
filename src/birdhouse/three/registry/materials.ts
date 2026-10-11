import { DoubleSide, LineBasicMaterial, LineDashedMaterial, MeshBasicMaterial, type Material } from 'three';
import { PALETTE } from './palette';

/**
 * Registre des matériaux PARTAGÉS de la 3D : créés à la demande, une seule fois, libérés ensemble par `disposeAll()` (fermeture de la vue).
 * Règle : un matériau qui vient d'ici ne doit jamais être libéré par la suppression d'une pièce (voir `isShared`).
 */
const cache = new Map<string, Material>();
function shared<T extends Material>(key: string, make: () => T): T {
  let m = cache.get(key);
  if (!m) { m = make(); cache.set(key, m); }
  return m as T;
}

export const materials = {
  /** Plan de coupe : carré bleu transparent. */
  cut: () => shared('cut', () => new MeshBasicMaterial({ color: PALETTE.cutPlane, transparent: true, opacity: 0.18, side: DoubleSide, depthWrite: false })),
  /** Contour de la face à tirer : pointillés bleus. */
  pullMark: () => shared('pullMark', () => new LineDashedMaterial({ color: PALETTE.pullMark, dashSize: 3, gapSize: 2, depthTest: false })),
  /** Contour du trou en cours de réglage : pointillés ambre. */
  holeMark: () => shared('holeMark', () => new LineDashedMaterial({ color: PALETTE.holeMark, dashSize: 2.5, gapSize: 1.5, depthTest: false })),
  /** Arêtes de toutes les plaques (marron foncé). */
  edge: () => shared('edge', () => new LineBasicMaterial({ color: PALETTE.plywoodEdge })),
  /** Cotes, testées en profondeur : trait de cote et traits de rappel. */
  dimLine: () => shared('dimLine', () => new LineBasicMaterial({ color: PALETTE.dimLine })),
  dimExtension: () => shared('dimExtension', () => new LineBasicMaterial({ color: PALETTE.dimExt })),
};

/** Ce matériau appartient-il au registre (donc à ne pas libérer avec une pièce) ? */
export function isShared(m: Material): boolean {
  for (const x of cache.values()) if (x === m) return true;
  return false;
}

/** Libère tous les matériaux partagés ; le prochain appel en recrée. */
export function disposeAll(): void {
  for (const m of cache.values()) m.dispose();
  cache.clear();
}
