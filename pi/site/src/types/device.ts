/** Miroir du dictionnaire `etat` de pi/nichoir.py (réponse de GET /api/etat). */
export type PeltierMode = 'froid' | 'chaud' | 'arrêt';

/** Messages d'erreur par matériel (clés présentes seulement quand quelque chose manque). */
export interface DeviceErrors {
  mock?: string;
  gpio?: string;
  bme280?: string;
  ds18b20?: string;
  securite?: string;
  delestage?: string;
  picamera2?: string;
  batterie?: string;
  meteo?: string;
  alerte_chaleur?: string;
  camera1?: string;
  camera2?: string;
}

export interface DeviceState {
  t_nid: number | null;
  hum_nid: number | null;
  t_dissipateur: number | null;
  peltier: PeltierMode;
  puissance: number;
  led_nid: boolean;
  led_ext: boolean;
  cam1: boolean;
  cam2: boolean;
  erreurs: DeviceErrors;
  derniere_lecture: string | null;
  batterie: Battery;
  meteo: Weather;
  auto: AutoState;
  conso: Consumption;
}

/** Niveau de la batterie (mesuré par l'INA219, sinon simulé) ; `pourcent` est null quand on ne sait pas. */
export interface Battery {
  pourcent: number | null;
  tension: number | null;
  source: 'simulée' | 'mesurée' | null;
  solaire_w?: number;
}

/** Réglages modifiables du Peltier automatique. */
export interface AutoSettings {
  min_gel: number;
  plafond_chauffe: number;
  ecart_ext: number;
  max_chaleur: number;
  hysteresis: number;
  puissance_max: number;
  pause_inversion: number;
  batterie_min_v: number;
  alerte_chaleur: number;
}
export type AutoSettingKey = keyof AutoSettings;
/** Peltier automatique : réglages, interrupteur, ce qu'il fait (`etat`) et la température visée (`cible`). */
export interface AutoState extends AutoSettings {
  actif: boolean;
  etat: 'inactif' | 'veille' | 'chauffe' | 'refroidit' | 'securite';
  raison: string;
  cible: number | null;
  avertissements: string[];
}
/** Ce que la page envoie à POST /api/auto (tout est facultatif). */
export type AutoPatch = Partial<AutoSettings> & { actif?: boolean };

/** Météo extérieure (Open-Meteo, ou simulée) ; les champs sont null tant qu'on n'a rien reçu. */
export interface Weather {
  t_ext: number | null;
  hum_ext: number | null;
  nuages: number | null;
  vent_kmh: number | null;
  jour: boolean | null;
  rayonnement: number | null;
  source: string | null;
  maj: string | null;
}

/** Consommation estimée, en watts. */
export interface Consumption {
  total_w: number | null;
  detail: { pi?: number; cameras?: number; led?: number; peltier?: number };
}
