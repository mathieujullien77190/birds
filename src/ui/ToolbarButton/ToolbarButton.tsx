import type { ButtonHTMLAttributes, ReactNode } from 'react';

/** Bouton de la barre flottante en haut de la vue : icône + libellé, `active` = bouton à bascule allumé (`tone` : couleur d'allumage). */
export function ToolbarButton({ icon, active, tone = 'sky', dense = false, muted = false, className = '', children, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  icon?: ReactNode; active?: boolean; tone?: 'emerald' | 'sky'; dense?: boolean; muted?: boolean; children: ReactNode;
}) {
  const on = tone === 'emerald' ? 'bg-emerald-600 text-white' : 'bg-sky-100 text-sky-900';
  const off = `${muted ? 'text-stone-700' : 'text-stone-800'} hover:bg-stone-100`;
  const shape = dense ? 'gap-1 rounded-md px-2 py-1 font-medium' : 'gap-1.5 rounded px-2.5 py-1 font-semibold transition-colors';
  return (
    <button type="button" {...props} className={`flex items-center text-xs ${shape} ${active ? on : off} ${className}`}>
      {icon !== undefined && <span aria-hidden>{icon}</span>} {children}
    </button>
  );
}
