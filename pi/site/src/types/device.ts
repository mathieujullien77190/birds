/** Miroir du dictionnaire `etat` de pi/nichoir.py (réponse de GET /api/etat). */

/** Messages d'erreur par matériel (clés présentes seulement quand quelque chose manque). */
export interface DeviceErrors {
  mock?: string;
  gpio?: string;
  bme280?: string;
  ventilo?: string;
  ventilo_gpio?: string;
  ventilo_pwm?: string;
  tachymetre?: string;
  delestage?: string;
  picamera2?: string;
  batterie?: string;
  sonde_ext?: string;
  alerte_chaleur?: string;
  camera1?: string;
  camera2?: string;
}

export interface DeviceState {
  t_nid: number | null;
  hum_nid: number | null;
  ventilo: Fan;
  led_nid: boolean;
  led_ext: boolean;
  cam1: boolean;
  cam2: boolean;
  erreurs: DeviceErrors;
  derniere_lecture: string | null;
  batterie: Battery;
  ext: Outside;
  auto: AutoState;
  conso: Consumption;
}

/** Ventilateur de 60 mm : vitesse commandée (0 = arrêt, sinon 30 à 100 %), vitesse mesurée (null sans tachymètre), qui commande et pourquoi. */
export interface Fan {
  pourcent: number;
  rpm: number | null;
  mode: 'arret' | 'manuel' | 'auto';
  raison: string;
  /** 12 V présent (interrupteur GPIO27) ; faux = ventilateur vraiment coupé. */
  alimente: boolean;
}

/** Niveau de la batterie (mesuré par l'INA219, sinon simulé) ; `pourcent` est null quand on ne sait pas. */
export interface Battery {
  pourcent: number | null;
  tension: number | null;
  source: 'simulée' | 'mesurée' | null;
  solaire_w?: number;
}

/** Réglages modifiables de la ventilation automatique. */
export interface AutoSettings {
  seuil_marche: number;
  ecart_ext: number;
  hysteresis: number;
  vitesse_min: number;
  vitesse_max: number;
  plage: number;
  alerte_chaleur: number;
}
export type AutoSettingKey = keyof AutoSettings;
/** Ventilation automatique : réglages, interrupteur, ce qu'elle fait (`etat`) et pourquoi (`raison`). */
export interface AutoState extends AutoSettings {
  actif: boolean;
  /** Mode hiver (ventilateur retiré, bloc isolant à sa place) : l'automatique ne démarre pas le ventilateur. */
  hiver: boolean;
  etat: 'inactif' | 'veille' | 'ventile' | 'securite';
  raison: string;
  avertissements: string[];
}
/** Ce que la page envoie à POST /api/auto (tout est facultatif). */
export type AutoPatch = Partial<AutoSettings> & { actif?: boolean; hiver?: boolean };

/** Un point de l'historique (GET /api/historique) : un toutes les 5 min sur le Pi, 288 au plus (24 h). */
export interface HistoryPoint {
  t: string;
  nid: number | null;
  ext: number | null;
  hum: number | null;
  ventilo: number;
}

/** Température de dehors, lue par la sonde DS18B20 étanche (ou simulée) ; `t` est null sans mesure valable (sonde absente, muette, hors plage). */
export interface Outside {
  t: number | null;
  source: 'DS18B20' | 'simulée' | null;
  maj: string | null;
}

/** Consommation estimée, en watts. */
export interface Consumption {
  total_w: number | null;
  detail: { pi?: number; cameras?: number; led?: number; ventilo?: number };
}
