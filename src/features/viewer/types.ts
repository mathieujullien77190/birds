import type { FaceAxis, PlankScene } from '@/birdhouse/model';
import type { Hover } from '@/types';

export type { Hover };

/** Menu du clic droit : position écran, plaque touchée et point touché dans son repère local. */
export interface ContextMenuState { x: number; y: number; plankId: string; local: [number, number] }

/** Fenêtre de réglage d'un trou ; `fresh` : trou qui vient d'être créé, ses réglages se fondent dans « Trou ajouté ». */
export interface HoleEdit { plankId: string; holeId: string; fresh?: boolean }

/** Face double-cliquée, à tirer (fonction retirée de l'interface, état gardé par le modèle). */
export interface PullState { plankId: string; axis: FaceAxis; sign: 1 | -1 }

/** Toute modification de la scène passe par `commit` (historique « Retour »). */
export type Commit = (label: string, next: (s: PlankScene) => PlankScene, merge?: boolean) => void;

/** Volet ouvert du panneau de droite. */
export type DrawerId = 'pieces' | 'history';
