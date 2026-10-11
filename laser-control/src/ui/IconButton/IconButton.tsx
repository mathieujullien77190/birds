import type { ButtonHTMLAttributes } from 'react';

const SIZES = {
  xs: 'px-1', // œil, dupliquer
  sm: 'px-1 text-sm', // croix d'une ligne
  md: 'px-1.5 text-sm', // croix d'une petite fenêtre
  lg: 'px-2 text-xl leading-none text-stone-500 hover:bg-stone-100', // croix d'une fenêtre modale
  schema: 'px-2 text-lg leading-none text-stone-500 hover:bg-stone-100', // croix de la fiche d'un module
} as const;

/** Bouton-icône discret (×, ⧉, œil…) : texte gris, fond gris au survol. `dim` = grisé plus clair (élément caché). */
export function IconButton({ size = 'xs', dim = false, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { size?: keyof typeof SIZES; dim?: boolean }) {
  const tone = size === 'lg' || size === 'schema' ? '' : `${dim ? 'text-stone-300' : 'text-stone-400'} hover:bg-stone-200 hover:text-stone-700`;
  return <button type="button" {...props} className={`rounded ${SIZES[size]} ${tone} ${className}`} />;
}
