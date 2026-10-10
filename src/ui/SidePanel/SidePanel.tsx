import type { ReactNode } from 'react';

/** Panneau latéral repliable : ouvert = contenu (largeur fixe) ; replié = languette étroite à flèche sur la tranche qui le rouvre. */
export function SidePanel({ side, open, onOpen, openTitle, width, className = '', children }: {
  side: 'left' | 'right'; open: boolean; onOpen: () => void; openTitle: string; width: string; className?: string; children: ReactNode;
}) {
  const border = side === 'left' ? 'border-r' : 'border-l';
  if (!open) return <button type="button" onClick={onOpen} title={openTitle} className={`flex h-full w-7 shrink-0 items-start justify-center ${border} border-stone-200 bg-stone-50 pt-3 text-stone-500 hover:bg-stone-100`}>{side === 'left' ? '▸' : '◂'}</button>;
  return <aside className={`flex h-full ${width} shrink-0 flex-col ${border} border-stone-200 bg-stone-50 ${className}`}>{children}</aside>;
}
