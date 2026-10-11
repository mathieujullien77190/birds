import { useEffect, useState } from 'react';

/** Booléen gardé dans localStorage (`'1'` / `'0'`) : `initial` (vrai par défaut) tant que la clé n'existe pas, ensuite faux seulement si elle vaut `'0'`. */
export function usePersistentFlag(key: string, initial = true): [boolean, (v: boolean | ((o: boolean) => boolean)) => void] {
  const [on, setOn] = useState<boolean>(() => { try { const v = localStorage.getItem(key); return v === null ? initial : v !== '0'; } catch { return initial; } });
  useEffect(() => { try { localStorage.setItem(key, on ? '1' : '0'); } catch { /* rien */ } }, [key, on]);
  return [on, setOn];
}
