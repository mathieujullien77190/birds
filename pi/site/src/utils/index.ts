/** Affiche une valeur de capteur, ou un tiret quand elle manque. */
export const fmt = (v: number | null | undefined): string => (v ?? '—').toString();
