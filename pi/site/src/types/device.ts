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
  conso: Consumption;
}

/** Niveau de la batterie (mesuré par l'INA219, sinon simulé) ; `pourcent` est null quand on ne sait pas. */
export interface Battery {
  pourcent: number | null;
  tension: number | null;
  source: 'simulée' | 'mesurée' | null;
  solaire_w?: number;
}

/** Consommation estimée, en watts. */
export interface Consumption {
  total_w: number | null;
  detail: { pi?: number; cameras?: number; led?: number; peltier?: number };
}
