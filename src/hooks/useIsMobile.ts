import { useEffect, useState } from 'react';

/** Largeur sous laquelle l'écran est traité comme un téléphone (px). */
export const MOBILE_MAX = 767;
const QUERY = `(max-width: ${MOBILE_MAX}px)`;

/** Vrai sur un écran étroit (téléphone) ; suit les changements de taille et d'orientation. */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(QUERY);
    if (!mq) return;
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return mobile;
}
