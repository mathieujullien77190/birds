import type { ReactNode } from 'react';

export interface CardProps {
  title: string;
  /** Classe CSS en plus (ex. « wide » : la carte occupe toute la ligne). */
  className?: string;
  children: ReactNode;
}
