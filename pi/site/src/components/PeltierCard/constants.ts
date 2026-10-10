import type { PeltierMode } from '@/types';

/** Les trois boutons de mode (id conservés pour le simulateur de l'app). */
export const MODES: { mode: PeltierMode; id: string; label: string }[] = [
  { mode: 'froid', id: 'p_froid', label: 'Froid' },
  { mode: 'chaud', id: 'p_chaud', label: 'Chaud' },
  { mode: 'arrêt', id: 'p_arret', label: 'Arrêt' },
];
