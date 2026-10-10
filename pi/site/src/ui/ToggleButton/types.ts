import type { ReactNode } from 'react';

export interface ToggleButtonProps {
  /** Identifiant du bouton (le simulateur de l'app s'en sert). */
  id?: string;
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}
