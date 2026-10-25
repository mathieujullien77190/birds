/**
 * Durée d'un programme comme la machine le fait : le planificateur de GRBL ne roule jamais à la vitesse demandée sur tout le trajet. Chaque tracé accélère puis ralentit
 * (accélération `$120` / `$121`), et dans un coin la tête ne peut pas garder sa vitesse (limite de « junction deviation » `$11`) : sur de petites pièces avec beaucoup de coins,
 * le temps réel est bien plus long que `longueur / vitesse`. Fonctions pures.
 */

export interface MotionParams {
  /** Accélération par axe (mm/s², `$120` / `$121`). */
  accel: number;
  /** Tolérance dans les coins (mm, `$11`) : plus elle est petite, plus la tête ralentit aux angles. */
  junctionDev: number;
  /** Vitesse maximale par axe (mm/min, `$110` / `$111`). */
  maxRate: number;
}

/** Réglages relevés sur la Sculpfun E1 Pro (`$$`) : `$120 = $121 = 1000`, `$11 = 0.010`, `$110 = $111 = 36000`. */
export const E1_MOTION: MotionParams = { accel: 1000, junctionDev: 0.01, maxRate: 36000 };

/** Un déplacement : de combien de mm sur X et Y, à quelle vitesse demandée (mm/min). */
export interface MotionBlock { dx: number; dy: number; feed: number }

/** Paramètres de mouvement lus des réglages de la machine (`$$` : numéro → valeur) ; ceux de la E1 Pro pour tout réglage absent ou invalide. */
export function motionFrom(settings: Record<number, number>): MotionParams {
  const ok = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const lo = (a: number | undefined, b: number | undefined, d: number) => (ok(a) && ok(b) ? Math.min(a, b) : ok(a) ? a : ok(b) ? b : d);
  return { accel: lo(settings[120], settings[121], E1_MOTION.accel), junctionDev: ok(settings[11]) ? settings[11] : E1_MOTION.junctionDev, maxRate: lo(settings[110], settings[111], E1_MOTION.maxRate) };
}

/**
 * Durée (s) de chaque déplacement, comme le planificateur de GRBL : vitesse limitée par axe, accélération par axe, vitesse dans chaque coin selon la tolérance `$11`
 * (formule de GRBL), puis passes arrière (freiner à temps jusqu'à l'arrêt final) et avant (accélérer jusqu'où la distance le permet) ; départ et arrivée à l'arrêt.
 * Un déplacement de longueur nulle dure 0 et est ignoré (ses voisins se rejoignent).
 */
export function blockTimes(all: MotionBlock[], p: MotionParams = E1_MOTION): number[] {
  const keep = all.map((b, i) => (Math.hypot(b.dx, b.dy) > 0 ? i : -1)).filter((i) => i >= 0); // un déplacement nul est ignoré, comme le fait GRBL : ses voisins se rejoignent
  const out = new Array<number>(all.length).fill(0), t = plan(keep.map((i) => all[i]), p);
  keep.forEach((i, k) => { out[i] = t[k]; });
  return out;
}

/** Durée de déplacements tous de longueur non nulle. */
function plan(blocks: MotionBlock[], p: MotionParams): number[] {
  const n = blocks.length;
  const len = blocks.map((b) => Math.hypot(b.dx, b.dy));
  const ux = blocks.map((b, i) => b.dx / len[i]), uy = blocks.map((b, i) => b.dy / len[i]);
  const axis = blocks.map((_, i) => Math.max(Math.abs(ux[i]), Math.abs(uy[i]))); // l'axe le plus sollicité fixe la vitesse et l'accélération permises dans cette direction
  const acc = blocks.map((_, i) => p.accel / axis[i]);
  const vNom = blocks.map((b, i) => Math.min(Math.max(b.feed, 1), p.maxRate / axis[i]) / 60); // mm/s
  // vitesse d'entrée de chaque déplacement : 0 au départ, limitée par le coin avec le précédent
  const v = new Array<number>(n + 1).fill(0);
  for (let i = 1; i < n; i++) {
    const cos = -(ux[i - 1] * ux[i] + uy[i - 1] * uy[i]);
    let vj: number;
    if (cos < -0.999999) vj = Infinity; // ligne droite : aucune limite due au coin
    else if (cos > 0.999999) vj = 0; // demi-tour
    else { const sinHalf = Math.sqrt(0.5 * (1 - cos)); vj = Math.sqrt((acc[i] * p.junctionDev * sinHalf) / (1 - sinHalf)); }
    v[i] = Math.min(vj, vNom[i - 1], vNom[i]);
  }
  v[n] = 0;
  for (let i = n - 1; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * acc[i] * len[i]));
  for (let i = 0; i < n; i++) v[i + 1] = Math.min(v[i + 1], Math.sqrt(v[i] ** 2 + 2 * acc[i] * len[i]));
  return blocks.map((_, i) => {
    const v0 = v[i], v1 = v[i + 1], a = acc[i], d = len[i];
    const vp = Math.min(vNom[i], Math.sqrt((2 * a * d + v0 * v0 + v1 * v1) / 2)); // vitesse de pointe : le palier si la distance le permet, sinon un triangle
    const dAcc = (vp * vp - v0 * v0) / (2 * a), dDec = (vp * vp - v1 * v1) / (2 * a);
    return (vp - v0) / a + (vp - v1) / a + Math.max(0, d - dAcc - dDec) / vp;
  });
}
