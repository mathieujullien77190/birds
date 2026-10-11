import { useCallback, useEffect, useRef, useState } from 'react';
import { getHistory, getState, setAuto, setCamera, setFan, setLed } from '@/api';
import { PERIODE } from '@/constants';
import type { AutoPatch, DeviceState, HistoryPoint } from '@/types';

/** Relit l'état et l'historique toutes les PERIODE ms et expose les commandes (chacune met l'état à jour). */
export function useDeviceState() {
  const [state, setState] = useState<DeviceState | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [unreachable, setUnreachable] = useState(false);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const s = await getState();
      if (alive.current) { setState(s); setUnreachable(false); }
    } catch {
      if (alive.current) setUnreachable(true);
    }
    try {
      const h = await getHistory();
      if (alive.current && Array.isArray(h)) setHistory(h);
    } catch { /* pas d'historique : le graphique dit « pas encore de données » */ }
  }, []);

  useEffect(() => {
    alive.current = true;
    refresh();
    const id = setInterval(refresh, PERIODE);
    return () => { alive.current = false; clearInterval(id); };
  }, [refresh]);

  const apply = useCallback(async (cmd: Promise<DeviceState>) => {
    const s = await cmd;
    if (alive.current) setState(s);
  }, []);

  return {
    state,
    history,
    unreachable,
    fan: (pct: number) => apply(setFan(pct)),
    auto: (patch: AutoPatch) => apply(setAuto(patch)),
    led: (quoi: 'nid' | 'ext', on: boolean) => apply(setLed(quoi, on)),
    camera: (num: 0 | 1, on: boolean) => apply(setCamera(num, on)),
  };
}
