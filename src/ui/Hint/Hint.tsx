import type { ReactNode } from 'react';

/** Texte d'aide discret. */
export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-[11px] leading-snug text-stone-500">{children}</p>;
}
