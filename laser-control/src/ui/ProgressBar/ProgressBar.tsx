const TONES = { ok: 'bg-emerald-600', busy: 'bg-amber-500', error: 'bg-rose-600' } as const;

/** Barre de progression (`value` de 0 à 1) avec un libellé facultatif au-dessus. */
export function ProgressBar({ value, label, tone = 'ok' }: { value: number; label?: string; tone?: keyof typeof TONES }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="space-y-1">
      {label && <div className="flex justify-between text-[11px] text-stone-600"><span>{label}</span><span className="tabular-nums">{pct} %</span></div>}
      <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-stone-200">
        <div className={`h-full ${TONES[tone]} transition-[width]`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
