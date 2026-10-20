import type { DeviceState, HistoryPoint } from '@/types';

/** État complet et sain (nid 24 °C, ventilateur arrêté). */
export function makeState(over: Partial<DeviceState> = {}): DeviceState {
  return {
    t_nid: 24.5,
    hum_nid: 55,
    ventilo: { pourcent: 0, rpm: null, mode: 'arret', raison: 'arrêté', alimente: true },
    led_nid: false,
    led_ext: false,
    cam1: true,
    cam2: false,
    erreurs: {},
    derniere_lecture: '12:34:56',
    ext: { t: 20, source: 'DS18B20', maj: '12:30' },
    auto: {
      seuil_marche: 28, ecart_ext: 2, hysteresis: 1, vitesse_min: 30, vitesse_max: 100, plage: 6, alerte_chaleur: 38,
      actif: false, hiver: false, etat: 'inactif', raison: 'désactivée', avertissements: [],
    },
    conso: { total_w: 10, detail: { pi: 5, cameras: 3, led: 2, ventilo: 0 } },
    ...over,
  };
}

export const point = (t: string, nid: number | null, ext: number | null, ventilo = 0): HistoryPoint => ({ t, nid, ext, hum: 50, ventilo });
