import { useEffect, useState } from 'react';

/** Booléen gardé dans localStorage (`'1'` / `'0'`) : vrai par défaut, faux seulement si la clé vaut `'0'`. */
export function usePersistentFlag(key: string): [boolean, (v: boolean | ((o: boolean) => boolean)) => void] {
  const [on, setOn] = useState<boolean>(() => { try { return localStorage.getItem(key) !== '0'; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem(key, on ? '1' : '0'); } catch { /* rien */ } }, [key, on]);
  return [on, setOn];
}
