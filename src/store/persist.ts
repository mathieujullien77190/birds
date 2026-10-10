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

// ----- sessions : une par fichier, nom généré (fichier1, fichier2…), jamais supprimée -----

export interface SessionInfo { name: string; label: string; at: number }
const SESSIONS_KEY = 'visionneuse-stl-sessions';

export const loadSessions = (): SessionInfo[] => {
  try { return (JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? '[]') as SessionInfo[]) ?? []; } catch { return []; }
};

/** Crée la session d'un nom de fichier si elle n'existe pas (nom généré : fichier1, fichier2…) et renvoie toute la liste. */
export const ensureSession = (name: string): SessionInfo[] => {
  const list = loadSessions();
  if (list.some((s) => s.name === name)) return list;
  const n = list.reduce((m, s) => Math.max(m, Number(/^fichier(\d+)$/.exec(s.label)?.[1] ?? 0)), 0) + 1;
  const next = [...list, { name, label: `fichier${n}`, at: Date.now() }];
  try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(next)); } catch { /* quota : tant pis */ }
  return next;
};

// ----- annulation réversible : l'état avant « annuler tout » est gardé pour pouvoir reprendre -----

export interface Snapshot { prefs: ModelPrefs; edit?: SavedEdit; traces?: Float32Array[] }
const SNAPS_KEY = 'visionneuse-stl-annulations';
const snapNames = (): string[] => { try { return JSON.parse(localStorage.getItem(SNAPS_KEY) ?? '[]') as string[]; } catch { return []; } };
export const hasSnapshot = (name: string): boolean => snapNames().includes(name);
export const putSnapshot = async (name: string, snap: Snapshot): Promise<void> => {
  await run('readwrite', (s) => s.put(snap, `n:${name}:snap`));
  try { localStorage.setItem(SNAPS_KEY, JSON.stringify([...new Set([...snapNames(), name])])); } catch { /* quota */ }
};
export const getSnapshot = (name: string): Promise<Snapshot | undefined> => run<Snapshot | undefined>('readonly', (s) => s.get(`n:${name}:snap`));
export const dropSnapshot = async (name: string): Promise<void> => {
  await run('readwrite', (s) => s.delete(`n:${name}:snap`));
  try { localStorage.setItem(SNAPS_KEY, JSON.stringify(snapNames().filter((n) => n !== name))); } catch { /* quota */ }
};

/** Supprime pour de bon une session fermée : entrée de la liste, réglages, fichier, retouches, traits et annulation gardés. */
export const deleteSession = async (name: string): Promise<SessionInfo[]> => {
  const next = loadSessions().filter((s) => s.name !== name);
  try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(next)); } catch { /* quota */ }
  try { const all = readStates(); delete all[name]; localStorage.setItem(STATES_KEY, JSON.stringify(all)); } catch { /* quota */ }
  try { localStorage.setItem(SNAPS_KEY, JSON.stringify(snapNames().filter((n) => n !== name))); } catch { /* quota */ }
  await Promise.all([name, `n:${name}:edit`, `n:${name}:traces`, `n:${name}:snap`].map((k) => deleteFile(k).catch(() => undefined)));
  return next;
};
