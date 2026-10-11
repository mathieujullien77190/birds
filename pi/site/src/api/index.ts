import type { AutoPatch, DeviceState, HistoryPoint } from '@/types';

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

/** Les températures des dernières 24 h (un point toutes les 5 min sur le Pi). */
export async function getHistory(): Promise<HistoryPoint[]> {
  return (await fetch('/api/historique')).json();
}

/** `pourcent` : 0 = arrêt, sinon 30 à 100. */
export const setFan = (pourcent: number) => post('/api/ventilo', pourcent > 0 ? { pourcent } : { mode: 'arret' });

export const setLed = (quoi: 'nid' | 'ext', on: boolean) => post('/api/led', quoi === 'nid' ? { nid: on } : { ext: on });

/** Active ou règle la ventilation automatique (les champs absents ne changent pas). */
export const setAuto = (patch: AutoPatch) => post('/api/auto', patch);

/** `num` : 0 pour la caméra 1, 1 pour la caméra 2. */
export const setCamera = (num: 0 | 1, on: boolean) => post('/api/camera', { num, on });
