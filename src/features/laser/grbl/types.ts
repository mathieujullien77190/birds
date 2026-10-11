/** Types du protocole GRBL 1.1 (aucune dépendance à React ni au DOM). */

export type GrblState = 'Idle' | 'Run' | 'Hold' | 'Jog' | 'Alarm' | 'Door' | 'Check' | 'Home' | 'Sleep';

export interface Vec3 { x: number; y: number; z: number }

/** Rapport d'état d'un `?` : positions en mm (machine et travail), avance et puissance courantes. */
export interface GrblStatus {
  state: GrblState;
  /** Sous-état (`Hold:0` = arrêt fini, `Hold:1` = freinage en cours). */
  sub: number | null;
  mpos: Vec3;
  wpos: Vec3;
  /** Décalage d'origine de travail (WCO) connu. */
  wco: Vec3;
  /** Vitesse d'avance courante (mm/min). */
  feed: number;
  /** Valeur S courante (0 = laser éteint). */
  spindle: number;
}

/** Réponse à une ligne envoyée. */
export type GrblResponse = { ok: true } | { ok: false; code: number | null; message: string };

/** Une ligne du journal des échanges. */
export interface LogEntry {
  id: number;
  dir: 'tx' | 'rx' | 'info';
  text: string;
  /** Interrogation d'état (`?`) ou son rapport : masquée par défaut dans le journal. */
  poll?: boolean;
}

/**
 * Liaison avec le contrôleur : port série réel (`WebSerialTransport`) ou machine simulée (`MockTransport`).
 * `write` envoie les caractères en latin-1 (un caractère = un octet, y compris les commandes temps réel 0x18 et 0x85).
 */
export interface GrblTransport {
  readonly kind: 'serial' | 'mock';
  readonly label: string;
  open(): Promise<void>;
  write(data: string): Promise<void>;
  close(): Promise<void>;
  onData: ((chunk: string) => void) | null;
  /** Appelé quand la liaison se ferme ; `unexpected` = pas à la demande de l'application (câble débranché…). */
  onClose: ((unexpected: boolean, reason?: string) => void) | null;
}

/** Commandes temps réel de GRBL. */
export const RT = { status: '?', hold: '!', resume: '~', reset: '\x18', jogCancel: '\x85' } as const;

/** Taille du tampon de réception de GRBL 1.1 (octets), base du protocole « character counting ». */
export const RX_BUFFER = 127;
