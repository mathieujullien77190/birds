import { useEffect } from 'react';

interface Sentinel { release: () => Promise<void> }
type WakeNavigator = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<Sentinel> } };

/**
 * Garde l'écran allumé tant que `active` est vrai (API Screen Wake Lock) : utile à l'atelier, téléphone en main.
 * Les navigateurs sans l'API et les refus (batterie faible, onglet caché) sont ignorés sans bruit. Le verrou est perdu quand la page est cachée :
 * il est redemandé au retour.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    const api = (navigator as WakeNavigator).wakeLock;
    if (!active || !api) return;
    let sentinel: Sentinel | null = null;
    let stopped = false;
    const ask = () => {
      api.request('screen').then((s) => { if (stopped) void s.release().catch(() => undefined); else sentinel = s; }, () => undefined);
    };
    const onVisible = () => { if (document.visibilityState === 'visible') ask(); };
    ask();
    document.addEventListener('visibilitychange', onVisible);
    return () => { stopped = true; document.removeEventListener('visibilitychange', onVisible); void sentinel?.release().catch(() => undefined); };
  }, [active]);
}
