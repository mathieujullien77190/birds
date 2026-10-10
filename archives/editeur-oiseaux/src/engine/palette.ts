import { Color, SRGBColorSpace } from 'three';

const hsl = { h: 0, s: 0, l: 0 };

/**
 * Teinte « style Alba » : couleurs pastel, un peu désaturées, jamais trop sombres.
 * `dl` décale la luminosité (−1 … 1).
 */
export function albaTone(hex: string, dl = 0): Color {
  const c = new Color(hex);
  c.getHSL(hsl, SRGBColorSpace);
  const s = Math.min(1, hsl.s * 0.9 + 0.05);
  const l = Math.min(1, Math.max(0, hsl.l + dl)) * 0.82 + 0.16;
  return new Color().setHSL(hsl.h, s, l, SRGBColorSpace);
}

/** Bruit déterministe 0…1 à partir d'une position (mêmes entrées = même sortie). */
export function hashPos(x: number, y: number, z: number, seed: number): number {
  const v =
    Math.sin(
      Math.round(x * 1e4) / 1e4 * 12.9898 +
        Math.round(y * 1e4) / 1e4 * 78.233 +
        Math.round(z * 1e4) / 1e4 * 37.719 +
        seed * 4.1,
    ) * 43758.5453;
  return v - Math.floor(v);
}

/** Couleurs de l'ambiance (ciel, sol, lumières). */
export const AMBIENT = {
  sky: '#e9f1f3',
  ground: '#dde8d2',
  groundEdge: '#cfdcc3',
  gridMajor: '#9fb08f',
  gridMinor: '#b7c6a6',
  hemiSky: '#ffffff',
  hemiGround: '#b8c7a8',
  sun: '#fff6e6',
  selectionEmissive: '#3a5a8c',
} as const;
