import type { ReactNode } from 'react';

/** En-tête d'un panneau : titre en gras, précision grise à côté, bandeau séparé du contenu par un filet. */
export function PanelHeader({ title, hint }: { title: ReactNode; hint?: ReactNode }) {
  return (
    <div className="border-b border-stone-200 px-3 py-2 text-[11px] font-semibold text-stone-700">
      {title}{hint && <> <span className="font-normal text-stone-400">{hint}</span></>}
    </div>
  );
}
