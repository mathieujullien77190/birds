import type { ReactNode } from 'react';

const TONES = { info: 'bg-stone-100 text-stone-700', ok: 'bg-emerald-50 text-emerald-900', warn: 'bg-amber-50 text-amber-900', error: 'bg-red-50 text-red-800' };

/** Message encadré : résultat, avertissement ou erreur. */
export function Notice({ kind = 'info', children }: { kind?: keyof typeof TONES; children: ReactNode }) {
  return <p className={`rounded-md px-2.5 py-1.5 text-[11px] leading-snug ${TONES[kind]}`}>{children}</p>;
}
