/** Positions gardées au centième de millimètre : les plaques d'une boîte sont à ± une demi-épaisseur (1,5 mm), un arrondi au millimètre les décalerait de 0,5 mm et les crans ne tomberaient plus en face. */
export const r2 = (x: number): number => Math.round(x * 100) / 100;

export const uid = (): string => Math.random().toString(36).slice(2, 9);
