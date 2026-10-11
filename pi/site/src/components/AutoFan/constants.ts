import type { AutoSettingKey } from '@/types';

/** Les réglages de la ventilation automatique (mêmes bornes que AUTO_LIMITES dans pi/nichoir.py). */
export const AUTO_FIELDS: { key: AutoSettingKey; label: string; hint: string; unit: string; min: number; max: number; step: number }[] = [
  { key: 'seuil_marche', label: 'Démarrer si le nid dépasse', hint: 'température intérieure du nid (BME280)', unit: '°C', min: 15, max: 45, step: 0.5 },
  { key: 'ecart_ext', label: '… et dépasse dehors d’au moins', hint: 'ne démarre que si l’air de dehors est plus frais (météo en ligne) ; sans météo cette condition est ignorée', unit: '°C', min: 0, max: 15, step: 0.5 },
  { key: 'hysteresis', label: 'Marge pour s’arrêter', hint: 'le ventilateur s’arrête à « seuil − marge » : évite qu’il clignote', unit: '°C', min: 0.2, max: 10, step: 0.1 },
  { key: 'vitesse_min', label: 'Vitesse minimale', hint: 'vitesse au démarrage (en dessous de 30 % un ventilateur Noctua tourne mal)', unit: '%', min: 30, max: 100, step: 5 },
  { key: 'vitesse_max', label: 'Vitesse maximale', hint: 'plafond de la vitesse', unit: '%', min: 30, max: 100, step: 5 },
  { key: 'plage', label: 'Vitesse maximale atteinte à', hint: 'la vitesse monte du minimum au maximum sur cette plage au-dessus du seuil', unit: '°C au-dessus du seuil', min: 1, max: 20, step: 0.5 },
  { key: 'alerte_chaleur', label: 'Alerte si le nid dépasse', hint: 'avertissement affiché (et notification si configurée), même sans le mode automatique', unit: '°C', min: 31, max: 50, step: 0.5 },
];
