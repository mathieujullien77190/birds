import { DoubleSide, LineBasicMaterial, LineDashedMaterial, MeshBasicMaterial, type CanvasTexture, type Material } from 'three';
import { makeOakTexture } from '../oakTexture';
import { PALETTE } from './palette';

/** Une ressource GPU libérable (matériau, texture). */
interface Disposable { dispose(): void }

/**
 * Registre des ressources PARTAGÉES de la 3D (matériaux, textures) : créées à la demande, une seule fois, libérées ensemble par `disposeAll()` (fermeture de la vue).
 * Règle : une ressource qui vient d'ici ne doit jamais être libérée par la suppression d'une pièce (voir `isShared`).
 */
const cache = new Map<string, Disposable>();
function shared<T extends Disposable>(key: string, make: () => T): T {
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

/** Textures partagées. */
export const textures = {
  /** Chêne procédurale du pan de toit (une seule pour tout le monde). */
  oak: (): CanvasTexture => shared('oak', makeOakTexture),
};

/** Cette ressource (matériau, texture) appartient-elle au registre (donc à ne pas libérer avec une pièce) ? */
export function isShared(m: Material | Disposable): boolean {
  for (const x of cache.values()) if (x === m) return true;
  return false;
}

/** Libère toutes les ressources partagées ; le prochain appel en recrée. */
export function disposeAll(): void {
  for (const m of cache.values()) m.dispose();
  cache.clear();
}
