/** Ce dont la boucle a besoin du navigateur (doublé dans les tests). */
export interface LoopEnv {
  request(cb: FrameRequestCallback): number;
  cancel(id: number): void;
  /** La page est-elle cachée (autre onglet, fenêtre réduite) ? */
  hidden(): boolean;
}

const browserEnv: LoopEnv = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (id) => cancelAnimationFrame(id),
  hidden: () => document.hidden,
};

/**
 * Boucle de rendu : appelle `step` à chaque image (la première tout de suite), mais ne fait rien tant que la page est cachée.
 * Renvoie la fonction qui l'arrête.
 */
export function startRenderLoop(step: () => void, env: LoopEnv = browserEnv): () => void {
  let id = 0, stopped = false;
  const frame = () => {
    if (stopped) return;
    if (!env.hidden()) step();
    id = env.request(frame);
  };
  frame();
  return () => { stopped = true; env.cancel(id); };
}
