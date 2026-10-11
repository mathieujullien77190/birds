import type { StreamPhase } from '../../grbl';
import type { JobKind } from '../../hooks/useGcodeJob';
import type { LaserMachine } from '../../hooks/useLaserMachine';

export const PHASE_LABEL: Record<StreamPhase, string> = {
  idle: 'prêt',
  running: 'en cours',
  paused: 'en pause',
  draining: 'fin des mouvements',
  done: 'terminé',
  error: 'erreur',
  aborted: 'arrêté',
};

export const JOB_LABEL: Record<JobKind, string> = { cut: 'Découpe', test: "Planche d'essai", frame: 'Cadre à vide' };

/** Pourquoi on ne peut pas lancer la découpe (vide si tout est prêt). */
export function blockers(m: LaserMachine): string[] {
  const out: string[] = [];
  const { grbl } = m;
  if (!grbl.connected) return ['Connecte la laser (ou la machine simulée).'];
  const s = grbl.status?.state;
  if (s === 'Alarm') out.push('La machine est en alarme : déverrouille-la ($X) puis refais l\'origine.');
  else if (s && s !== 'Idle') out.push('La machine doit être inactive.');
  if (grbl.settings[30] === undefined || m.laserMode === undefined) out.push('Réglages $30 / $32 pas encore lus.');
  else if (m.laserMode !== 1) out.push('Active le mode laser ($32=1) dans « Connexion ».');
  if (!m.program?.lines.length) out.push('Aucune pièce à couper sur cette planche.');
  return out;
}
