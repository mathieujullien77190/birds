import type { Pt } from './homography';

/** Réglage de la vue plate de la caméra. `corners` : les 4 coins du rectangle de référence vus sur l'image corrigée de l'objectif (0..1, y vers le bas), dans l'ordre arrière gauche, arrière droit, avant droit, avant gauche de la machine. */
export interface CameraCalibration {
  k1: number;
  corners: [Pt, Pt, Pt, Pt];
  /** Taille réelle du rectangle de référence (mm) : sert à la proportion de la vue plate. */
  refW: number;
  refH: number;
  flat: boolean;
  grid: boolean;
}

export const CAMERA_KEY = 'laser-camera';

export const DEFAULT_CALIBRATION: CameraCalibration = {
  k1: 0,
  corners: [[0.12, 0.12], [0.88, 0.12], [0.88, 0.88], [0.12, 0.88]],
  refW: 400, refH: 320, flat: false, grid: true,
};

export const CORNER_NAMES = ['arrière gauche', 'arrière droit', 'avant droit', 'avant gauche'] as const;

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

/** Lit le texte gardé dans localStorage : tout ce qui est invalide retombe sur les valeurs par défaut. */
export function parseCalibration(raw: string | null): CameraCalibration {
  const d = DEFAULT_CALIBRATION;
  try {
    const o = JSON.parse(raw ?? '') as Partial<Record<keyof CameraCalibration, unknown>>;
    const c = Array.isArray(o.corners) && o.corners.length === 4 ? o.corners.map((p, i) => (Array.isArray(p) ? [num(p[0], 0, 1, d.corners[i][0]), num(p[1], 0, 1, d.corners[i][1])] as const : d.corners[i])) : d.corners;
    return {
      k1: num(o.k1, -1, 1, d.k1),
      corners: [c[0], c[1], c[2], c[3]],
      refW: num(o.refW, 10, 2000, d.refW), refH: num(o.refH, 10, 2000, d.refH),
      flat: o.flat === true, grid: o.grid !== false,
    };
  } catch { return d; }
}
