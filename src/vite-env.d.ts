/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Outil lancé par `npm run dev <outil>` (bird, birdhouse) ; vide = menu. */
  readonly VITE_TOOL?: string;
}
