import type { ButtonHTMLAttributes } from 'react';

/** Petit bouton à bascule (préréglage, direction, axe…). */
export function Chip({ active, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...props}
      className={`rounded border px-2 py-0.5 text-[11px] transition-colors ${active ? 'border-emerald-600 bg-emerald-50 font-semibold text-emerald-900' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-100'} ${className}`}
    />
  );
}
