import type { HTMLAttributes } from 'react';

const TONES = { neutral: 'border-stone-200', sky: 'border-sky-200' } as const;

/** Panneau flottant à fond blanc translucide posé sur la vue (position et taille via `className`, ex. `absolute top-3 left-3`). */
export function FloatingPanel({ tone = 'neutral', className = '', ...props }: HTMLAttributes<HTMLDivElement> & { tone?: keyof typeof TONES }) {
  return <div {...props} className={`rounded-lg border ${TONES[tone]} bg-white/90 shadow-sm backdrop-blur ${className}`} />;
}
