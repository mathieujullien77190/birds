import type { View } from './types';

/** Opacité de la cassette « fantôme » (le ventilateur tourne : on le voit à travers ses parois) et durée du fondu (s). */
export const GHOST = { opacity: 0.28, fade: 0.2 } as const;

/** Plaques de la cassette du ventilateur (parois, cadre du bas, couvercle) : la poignée, la grille, les plots et le ventilateur restent visibles ; le bloc d'hiver n'est pas concerné. */
export const isGhostPart = (name: string): boolean => /^Cassette ventilateur( \d| cadre du bas| couvercle)/.test(name);

/** Opacité visée : fantôme si le ventilateur tourne (vitesse > 0), pleine sinon. */
export const ghostTarget = (pct: number): number => (pct > 0 ? GHOST.opacity : 1);

/** Fondu linéaire de l'opacité vers la cible en `GHOST.fade` secondes : monotone, sans dépassement, même avec un grand pas de temps. */
export function fadeOpacity(cur: number, target: number, dt: number): number {
  if (!(dt > 0)) return cur;
  const step = ((1 - GHOST.opacity) * dt) / GHOST.fade;
  return cur < target ? Math.min(target, cur + step) : Math.max(target, cur - step);
}

/** Un pas de la boucle de rendu : fait évoluer `view.ghost.level` et l'applique au matériau des plaques fantômes (même matériau que la plaque, mutation réversible : plus fantôme, il redevient ce que la plaque demande). */
export function stepGhost(view: Pick<View, 'meshes' | 'fan' | 'ghost'>, dt: number): void {
  const g = view.ghost;
  g.level = fadeOpacity(g.level, ghostTarget(view.fan.pct), dt);
  for (const m of view.meshes.values()) {
    if (!m.ghost) continue;
    const mat = m.material, base = m.baseTransparent ? 0.3 : 1, o = Math.min(base, g.level), transparent = m.baseTransparent || g.level < 1;
    mat.opacity = o; mat.depthWrite = !transparent;
    if (mat.transparent !== transparent) { mat.transparent = transparent; mat.needsUpdate = true; }
  }
}
