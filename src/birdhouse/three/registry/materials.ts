import { DoubleSide, LineBasicMaterial, LineDashedMaterial, MeshBasicMaterial, PlaneGeometry, type Material } from 'three';
import { PALETTE } from './palette';

/** Une ressource GPU libérable (matériau, texture). */
interface Disposable { dispose(): void }

/**
 * Registre des ressources PARTAGÉES de la 3D (matériaux, textures) : créées à la demande, une seule fois, libérées ensemble par `disposeAll()` (fermeture de la vue).
 * Règle : une ressource qui vient d'ici ne doit jamais être libérée par la suppression d'une pièce (voir `isShared`).
 */
const live = new Set<Disposable>(); // ressources actuellement créées
const resets: (() => void)[] = []; // remise à zéro de chaque accesseur après `disposeAll`

/** Accesseur paresseux : crée la ressource au premier appel, la rend ensuite toujours la même (jusqu'au prochain `disposeAll`). */
function lazy<T extends Disposable>(make: () => T): () => T {
  let instance: T | null = null;
  resets.push(() => { instance = null; });
  return () => {
    if (!instance) { instance = make(); live.add(instance); }
    return instance;
  };
}

const keyed = new Map<string, Disposable>(); // ressources partagées par clé (une étiquette par code de plaque)
resets.push(() => keyed.clear());

/** Ressource partagée à clé : créée au premier appel avec cette clé, rendue telle quelle ensuite (jusqu'au prochain `disposeAll`). */
export function shared<T extends Disposable>(key: string, make: () => T): T {
  let r = keyed.get(key) as T | undefined;
  if (!r) { r = make(); keyed.set(key, r); live.add(r); }
  return r;
}

/** Géométries partagées. */
export const geometries = {
  /** Carré de 1 × 1 dans le plan XY : les étiquettes des codes de plaques le mettent à leur taille (échelle de la mesh). */
  unitPlane: lazy(() => new PlaneGeometry(1, 1)),
};

export const materials = {
  /** Plan de coupe : carré bleu transparent. */
  cut: lazy(() => new MeshBasicMaterial({ color: PALETTE.cutPlane, transparent: true, opacity: 0.18, side: DoubleSide, depthWrite: false })),
  /** Contour de la face à tirer : pointillés bleus. */
  pullMark: lazy(() => new LineDashedMaterial({ color: PALETTE.pullMark, dashSize: 3, gapSize: 2, depthTest: false })),
  /** Contour du trou en cours de réglage : pointillés ambre. */
  /** Arêtes de toutes les plaques (marron foncé). */
  edge: lazy(() => new LineBasicMaterial({ color: PALETTE.plywoodEdge })),
  /** Cotes, testées en profondeur : trait de cote et traits de rappel. */
  dimLine: lazy(() => new LineBasicMaterial({ color: PALETTE.dimLine })),
  dimExtension: lazy(() => new LineBasicMaterial({ color: PALETTE.dimExt })),
};

/** Cette ressource (matériau, texture) appartient-elle au registre (donc à ne pas libérer avec une pièce) ? */
export function isShared(m: Material | Disposable): boolean {
  return live.has(m);
}

/** Libère toutes les ressources partagées ; le prochain appel d'un accesseur en recrée. */
export function disposeAll(): void {
  for (const m of live) m.dispose();
  live.clear();
  resets.forEach((reset) => reset());
}
