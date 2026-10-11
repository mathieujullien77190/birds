import { useCallback, useEffect, useRef, useState } from 'react';
import { getState, setAuto, setCamera, setLed, setPeltier } from '@/api';
import { PERIODE } from '@/constants';
import type { AutoPatch, DeviceState, PeltierMode } from '@/types';

/** Relit l'état toutes les PERIODE ms et expose les commandes (chacune met l'état à jour). */
export function useDeviceState() {
  const [state, setState] = useState<DeviceState | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const s = await getState();
      if (alive.current) { setState(s); setUnreachable(false); }
    } catch {
      if (alive.current) setUnreachable(true);
    }
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
    unreachable,
    peltier: (sens: PeltierMode, pct: number) => apply(setPeltier(sens, pct / 100)),
    auto: (patch: AutoPatch) => apply(setAuto(patch)),
    led: (quoi: 'nid' | 'ext', on: boolean) => apply(setLed(quoi, on)),
    camera: (num: 0 | 1, on: boolean) => apply(setCamera(num, on)),
  };
}
