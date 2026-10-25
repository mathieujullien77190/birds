/**
 * Petite police à traits pour écrire les valeurs sur la planche d'essai : chiffres 0–9 et « % » sur une grille de 2 × 4 (x 0..2, y 0..4, y vers le haut).
 * Chaque caractère est une ou plusieurs polylignes OUVERTES, gravées en un seul trait (le laser suit la ligne, pas un contour fermé).
 */
type Stroke = [number, number][];

const BOX: Stroke = [[0, 0], [2, 0], [2, 4], [0, 4], [0, 0]];

const FONT: Record<string, Stroke[]> = {
  '0': [BOX, [[0, 0], [2, 4]]],
  '1': [[[1, 0], [1, 4], [0, 3]]],
  '2': [[[0, 4], [2, 4], [2, 2], [0, 2], [0, 0], [2, 0]]],
  '3': [[[0, 4], [2, 4], [2, 0], [0, 0]], [[0, 2], [2, 2]]],
  '4': [[[0, 4], [0, 2], [2, 2]], [[2, 4], [2, 0]]],
  '5': [[[2, 4], [0, 4], [0, 2], [2, 2], [2, 0], [0, 0]]],
  '6': [[[2, 4], [0, 4], [0, 0], [2, 0], [2, 2], [0, 2]]],
  '7': [[[0, 4], [2, 4], [1, 0]]],
  '8': [BOX, [[0, 2], [2, 2]]],
  '9': [[[2, 0], [2, 4], [0, 4], [0, 2], [2, 2]]],
  '%': [[[0, 0], [2, 4]], [[0, 3], [0.8, 3], [0.8, 4], [0, 4], [0, 3]], [[1.2, 0], [2, 0], [2, 1], [1.2, 1], [1.2, 0]]],
};

/** Largeur occupée par un texte de hauteur `height` (mm) : un caractère fait la moitié de la hauteur, avec un petit espace. */
export const textWidth = (text: string, height: number): number => Math.max(0, text.length * height * 0.75 - height * 0.25);

/**
 * Les traits à graver pour écrire `text` (caractères inconnus ignorés, l'espace avance seulement) : coin bas-gauche en (`x`, `y`), hauteur `height` (mm).
 */
export function textStrokes(text: string, x: number, y: number, height: number): [number, number][][] {
  const k = height / 4;
  const out: [number, number][][] = [];
  [...text].forEach((ch, i) => {
    const ox = x + i * height * 0.75;
    for (const st of FONT[ch] ?? []) out.push(st.map(([a, b]): [number, number] => [ox + a * k, y + b * k]));
  });
  return out;
}
