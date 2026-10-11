import { useEffect, useState } from 'react';

/**
 * État gardé dans localStorage : `parse` reçoit le texte stocké (ou `null`) et rend la valeur de départ (il doit gérer lui-même un texte invalide) ;
 * `serialize` produit le texte écrit à chaque changement (JSON par défaut).
 */
export function usePersistentState<T>(key: string, parse: (raw: string | null) => T, serialize: (v: T) => string = JSON.stringify) {
  const [value, setValue] = useState<T>(() => { let raw: string | null = null; try { raw = localStorage.getItem(key); } catch { /* rien */ } return parse(raw); });
  useEffect(() => { try { localStorage.setItem(key, serialize(value)); } catch { /* rien */ } }, [key, value]); // eslint-disable-line react-hooks/exhaustive-deps
  return [value, setValue] as const;
}
