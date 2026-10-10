/** Identifiant court aléatoire (plaques, trous, groupes). */
export const randomId = (): string => Math.random().toString(36).slice(2, 9);
