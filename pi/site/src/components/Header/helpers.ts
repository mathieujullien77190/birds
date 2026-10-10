import { INJOIGNABLE } from '@/constants';
import type { DeviceState } from '@/types';

/** Texte de la dernière lecture : l'heure du Pi, ou « programme injoignable » si la relecture a échoué. */
export const lastReading = (state: DeviceState | null, unreachable: boolean): string =>
  unreachable ? INJOIGNABLE : state?.derniere_lecture ?? '—';
