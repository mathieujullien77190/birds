import type { ButtonHTMLAttributes } from 'react';
import { VARIANTS, type BtnVariant } from './constants';

/** Bouton : `primary` pour l'action principale d'un bloc, `secondary` pour le reste, `danger` pour supprimer, `warn` pour annuler. */
export function Btn({ variant = 'secondary', block = true, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; block?: boolean }) {
  return (
    <button
      {...props}
      className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${block ? 'w-full' : ''} ${VARIANTS[variant]} ${className}`}
    />
  );
}
