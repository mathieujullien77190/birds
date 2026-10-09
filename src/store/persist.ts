import type { ModelState } from '@/engine/viewer';

/**
 * Persistance automatique, par NOM de fichier : tout ce qu'on fait sur un modèle est gardé sous son nom, donc redéposer le même
 * fichier le remet exactement où on l'avait laissé (retouches, traits, réduction, rotation, position, taille, couleur).
 * - liste des modèles de la session (clé 'visionneuse-stl-modeles') et état par nom (clé 'visionneuse-stl-etats') dans localStorage ;
 * - octets des fichiers, retouches (sommets) et traits dans IndexedDB (base 'visionneuse-stl'), car localStorage est limité à ~5 Mo.
 */

const LS_KEY = 'visionneuse-stl-modeles';
const DB = 'visionneuse-stl';
const STORE = 'fichiers';

export const saveSettings = (models: ModelState[], selectedId: string | null): void => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ version: 1, models, selectedId }));
  } catch { /* quota ou navigation privée : on continue sans sauvegarde */ }
};

export const loadSettings = (): { models: ModelState[]; selectedId: string | null } | null => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { models?: ModelState[]; selectedId?: string | null };
    return { models: (p.models ?? []).map((m) => ({ ...m, target: m.target ?? 0 })), selectedId: p.selectedId ?? null };
  } catch {
    return null;
  }
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) => new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    }),
  );
}

export const putFile = (id: string, buffer: ArrayBuffer): Promise<unknown> => run('readwrite', (s) => s.put(buffer, id));
export const getFile = (id: string): Promise<ArrayBuffer | undefined> => run<ArrayBuffer | undefined>('readonly', (s) => s.get(id));
export const deleteFile = (id: string): Promise<unknown> => run('readwrite', (s) => s.delete(id));

/** Traits de coupe gardés d'un modèle : un tableau de sommets (x, y, z par point, deux points par segment) par trait. */
export const putTraces = (name: string, traces: Float32Array[]): Promise<unknown> => run('readwrite', (s) => s.put(traces, `n:${name}:traces`));
export const getTraces = (name: string): Promise<Float32Array[] | undefined> => run<Float32Array[] | undefined>('readonly', (s) => s.get(`n:${name}:traces`));

/** Maillage retouché à la main : sommets (3 nombres par sommet, 3 sommets par triangle) et cible de réduction dont il part. */
export interface SavedEdit { target: number; positions: Float32Array }
export const putEdit = (name: string, edit: SavedEdit): Promise<unknown> => run('readwrite', (s) => s.put(edit, `n:${name}:edit`));
export const getEdit = (name: string): Promise<SavedEdit | undefined> => run<SavedEdit | undefined>('readonly', (s) => s.get(`n:${name}:edit`));
export const deleteEdit = (name: string): Promise<unknown> => run('readwrite', (s) => s.delete(`n:${name}:edit`));

/** Réglages d'un modèle gardés par nom de fichier. */
export type ModelPrefs = Pick<ModelState, 'target' | 'rot' | 'pos' | 'scale' | 'color'>;
const STATES_KEY = 'visionneuse-stl-etats';
const readStates = (): Record<string, ModelPrefs> => { try { return JSON.parse(localStorage.getItem(STATES_KEY) ?? '{}') as Record<string, ModelPrefs>; } catch { return {}; } };
export const saveModelPrefs = (models: ModelState[]): void => {
  try {
    const all = readStates();
    for (const m of models) all[m.name] = { target: m.target, rot: m.rot, pos: m.pos, scale: m.scale, color: m.color };
    localStorage.setItem(STATES_KEY, JSON.stringify(all));
  } catch { /* quota : tant pis */ }
};
export const loadModelPrefs = (name: string): ModelPrefs | undefined => readStates()[name];

/** Ancien format (clés par identifiant de session) : lu une fois pour migrer vers les clés par nom. */
export const getLegacyEdit = (id: string): Promise<SavedEdit | undefined> => run<SavedEdit | undefined>('readonly', (s) => s.get(`${id}:edit`));
export const getLegacyTraces = (id: string): Promise<Float32Array[] | undefined> => run<Float32Array[] | undefined>('readonly', (s) => s.get(`${id}:traces`));
