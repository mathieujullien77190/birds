import type { AutoSettingKey } from '@/types';

/** Les réglages du Peltier automatique (mêmes bornes que AUTO_LIMITES dans pi/nichoir.py). */
export const AUTO_FIELDS: { key: AutoSettingKey; label: string; hint: string; unit: string; min: number; max: number; step: number }[] = [
  { key: 'min_gel', label: 'Réchauffer si le nid passe sous', hint: 'température intérieure du nid', unit: '°C', min: -40, max: 10, step: 0.5 },
  { key: 'plafond_chauffe', label: 'Réchauffer jusqu’à (au plus)', hint: 'la cible est le plus petit de ce plafond et de « dehors + écart »', unit: '°C', min: -40, max: 20, step: 0.5 },
  { key: 'ecart_ext', label: 'Sans dépasser dehors de plus de', hint: 'température extérieure donnée par la météo en ligne', unit: '°C', min: 0, max: 30, step: 0.5 },
  { key: 'max_chaleur', label: 'Refroidir si le nid dépasse', hint: 'température intérieure du nid ; on vise cette valeur moins la marge', unit: '°C', min: 10, max: 50, step: 0.5 },
  { key: 'hysteresis', label: 'Marge pour s’arrêter (refroidissement)', hint: 'le froid s’arrête à « seuil − marge » : évite que le Peltier clignote', unit: '°C', min: 0.2, max: 5, step: 0.1 },
  { key: 'puissance_max', label: 'Puissance maximale du Peltier', hint: 'plafond de la puissance PWM', unit: '%', min: 10, max: 60, step: 5 },
  { key: 'pause_inversion', label: 'Pause avant d’inverser le sens', hint: 'temps à puissance nulle entre chaud et froid', unit: 's', min: 0, max: 600, step: 10 },
  { key: 'batterie_min_v', label: 'Couper si la batterie passe sous', hint: 'tension mesurée par l’INA219', unit: 'V', min: 10, max: 13, step: 0.1 },
  { key: 'alerte_chaleur', label: 'Alerte si le nid dépasse', hint: 'avertissement affiché (et notification si configurée), même sans le mode automatique', unit: '°C', min: 31, max: 50, step: 0.5 },
];
