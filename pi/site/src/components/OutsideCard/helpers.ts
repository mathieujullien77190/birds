import type { DeviceState } from '@/types';

/** Phrase d'état de la sonde extérieure, ou null tant qu'on n'a pas d'état du Pi. */
export function probeStatus(state: DeviceState | null): string | null {
  if (!state) return null;
  const { ext, erreurs } = state;
  if (ext.t !== null) {
    const quoi = ext.source === 'simulée' ? 'Sonde simulée' : 'Sonde DS18B20';
    return `${quoi} : mesure en direct${ext.maj ? `, ${ext.maj}` : ''}`;
  }
  return erreurs.sonde_ext ? 'Sonde absente ou muette : pas de mesure' : 'Pas encore de mesure';
}
