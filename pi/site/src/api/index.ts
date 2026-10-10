import type { DeviceState, PeltierMode } from '@/types';

// `fetch` est appelé à l'exécution (window.fetch) : le simulateur de l'app le redirige vers Pyodide.
async function lire(r: Response): Promise<DeviceState> {
  return r.json();
}

async function post(url: string, corps: unknown): Promise<DeviceState> {
  return lire(await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }));
}

export async function getState(): Promise<DeviceState> {
  return lire(await fetch('/api/etat'));
}

/** `puissance` entre 0 et 1. */
export const setPeltier = (sens: PeltierMode, puissance: number) => post('/api/peltier', { sens, puissance });

export const setLed = (quoi: 'nid' | 'ext', on: boolean) => post('/api/led', quoi === 'nid' ? { nid: on } : { ext: on });

/** `num` : 0 pour la caméra 1, 1 pour la caméra 2. */
export const setCamera = (num: 0 | 1, on: boolean) => post('/api/camera', { num, on });
