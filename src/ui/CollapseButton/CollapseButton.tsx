import type { ButtonHTMLAttributes } from 'react';

/** Petit bouton carré à flèche qui replie un panneau latéral. */
export function CollapseButton({ roomy = false, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { roomy?: boolean }) {
  return <button type="button" {...props} className={`rounded-md border border-stone-300 bg-white px-2 ${roomy ? 'py-1.5' : 'py-1'} text-xs text-stone-600 hover:bg-stone-100`} />;
}
