import { useCallback, useEffect, useMemo, useState } from 'react';
import { assemblySteps, type PlankScene } from '@/birdhouse/model';
import { usePersistentState, useWakeLock } from '@/hooks';
import { STORAGE } from '../constants';
import { clampIndex, indexOfStored, keyAction, viewOf } from '../components/AssemblyPanel/helpers';

/**
 * Mode Montage : les étapes de la scène, l'étape courante (son identifiant est gardé dans localStorage pour reprendre après un rechargement),
 * ← / → pour changer d'étape, Échap pour quitter, écran maintenu allumé tant que le mode est ouvert. N'écrit jamais la scène.
 * `view` = pièces à afficher et à surligner dans la 3D (null hors du mode).
 */
export function useAssembly(sc: PlankScene) {
  const [on, setOn] = useState(false);
  const [stored, setStored] = usePersistentState<string>(STORAGE.assembly, (raw) => raw ?? '', (v) => v);
  const steps = useMemo(() => (on ? assemblySteps(sc) : []), [on, sc]);
  const index = indexOfStored(stored, steps);
  const setIndex = useCallback((i: number) => { const st = steps[clampIndex(i, steps.length)]; if (st) setStored(st.id); }, [steps, setStored]);
  const next = useCallback(() => setIndex(index + 1), [setIndex, index]);
  const prev = useCallback(() => setIndex(index - 1), [setIndex, index]);
  useWakeLock(on);
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      const a = keyAction(e.key, typing);
      if (a === 'close') setOn(false); else if (a) { e.preventDefault(); if (a === 'next') next(); else prev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [on, next, prev]);
  const view = useMemo(() => (on ? viewOf(steps, index) : null), [on, steps, index]);
  return { on, setOn, steps, index, setIndex, next, prev, view };
}
