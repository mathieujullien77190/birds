import type { AutoState } from '@/types';

/** Libellé de l'état courant de la ventilation automatique. */
export const AUTO_LABELS: Record<AutoState['etat'], string> = {
  inactif: 'Désactivée',
  veille: 'Veille (ventilateur arrêté)',
  ventile: 'Ventile',
  securite: 'Arrêtée par sécurité',
};

/** Phrase qui dit ce que fait l'automatique et pourquoi. */
export function describeAuto(a: AutoState): string {
  return `${AUTO_LABELS[a.etat]} — ${a.raison}`;
}

/** Vrai si un des champs du brouillon diffère de la valeur enregistrée. */
export function isDirty(draft: Record<string, number | string>, saved: Record<string, number>): boolean {
  return Object.keys(draft).some((k) => Number(draft[k]) !== saved[k]);
}
