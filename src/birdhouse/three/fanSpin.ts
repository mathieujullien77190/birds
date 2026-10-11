import type { View } from './types';

/** Vitesse visuelle maximale du rotor (tours par seconde) : plus vite, l'écran à 60 images par seconde donnerait l'impression d'un rotor immobile ou qui tourne à l'envers. */
export const MAX_REV_PER_S = 3;
/** Plus grand pas de temps pris en compte par image (s) : après une pause (onglet caché) le rotor ne saute pas. */
export const MAX_DT = 0.1;

/** Angle suivant du rotor (radians, dans [0, 2π[) : 0 % = arrêt ; 100 % = `MAX_REV_PER_S` tours par seconde ; vitesse proportionnelle au pourcentage (borné à 0–100). */
export function advanceAngle(angle: number, pct: number, dt: number): number {
  const p = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
  if (!(p > 0) || !(dt > 0)) return angle;
  const full = Math.PI * 2;
  return (angle + (p / 100) * MAX_REV_PER_S * full * dt) % full;
}

/** Fait tourner les rotors de la vue d'un pas `dt` (secondes) à la vitesse `view.fan.pct`. Appelée à chaque image par la boucle de rendu. */
export function spinRotors(view: Pick<View, 'meshes' | 'fan'>, dt: number): void {
  const f = view.fan;
  f.angle = advanceAngle(f.angle, f.pct, Math.min(dt, MAX_DT));
  for (const m of view.meshes.values()) if (m.rotor) m.rotor.rotation.z = f.angle;
}
