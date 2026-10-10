import type { ButtonHTMLAttributes, HTMLAttributes } from 'react';

/** Menu contextuel flottant posé en (x, y) dans son parent positionné ; un clic dedans ne remonte pas. */
export function Menu({ x, y, ...props }: HTMLAttributes<HTMLDivElement> & { x: number; y: number }) {
  return <div {...props} className="absolute z-10 min-w-36 rounded-md border border-stone-200 bg-white py-1 text-xs shadow-lg" style={{ left: x, top: y }} onClick={(e) => e.stopPropagation()} />;
}

/** Ligne d'un menu contextuel. */
export function MenuItem(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className="block w-full px-3 py-1.5 text-left hover:bg-emerald-50" />;
}
