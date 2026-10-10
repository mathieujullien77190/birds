import { useEffect, useRef, useState } from 'react';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
  /** Repères sous le curseur (ex. le milieu de la pièce) : un trait cliquable à chaque valeur, avec son nom. */
  marks?: { at: number; label?: string }[];
}

/** Le dernier curseur touché à la souris : un chiffre tapé ensuite (même si le focus est perdu) va dans son champ. */
let lastTouched: HTMLInputElement | null = null;
const DIGIT = /^[0-9.,-]$/;

/** Curseur + valeur éditable au clavier : clic sur le nombre (ou sur le curseur puis un chiffre), taper, Entrée ou Tab ; Échap annule. */
export function Slider({ label, value, min, max, step, unit = '', onChange, marks }: Props) {
  const digits = step < 0.01 ? 3 : step < 1 ? 2 : 0;
  const shown = value.toFixed(digits);
  const [text, setText] = useState(shown);
  const [editing, setEditing] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const range = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!editing) setText(shown); }, [shown, editing]);

  /** Passe dans le champ texte en commençant par le caractère tapé. */
  const startTyping = (key: string) => {
    setEditing(true);
    setText(key);
    const f = field.current;
    if (f) { f.focus(); requestAnimationFrame(() => f.setSelectionRange(f.value.length, f.value.length)); }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || !DIGIT.test(e.key)) return;
      const active = document.activeElement;
      const mine = active === range.current || ((!active || active === document.body) && lastTouched === range.current);
      if (!mine) return;
      e.preventDefault();
      startTyping(e.key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** Boutons − / + : un pas (Maj : dix pas), borné. */
  const nudge = (k: number) => {
    const next = Math.min(max, Math.max(min, Math.round((value + k * step) / step) * step));
    onChange(+next.toFixed(digits));
  };

  const commit = () => {
    setEditing(false);
    const v = parseFloat(text.replace(',', '.'));
    if (Number.isNaN(v)) { setText(shown); return; }
    onChange(Math.min(max, Math.max(min, v)));
  };

  return (
    <label className="block">
      <span className="flex items-center justify-between text-xs text-stone-600">
        <span>{label}</span>
        <span className="flex items-center gap-0.5 tabular-nums text-stone-800">
          <button
            type="button"
            onClick={(e) => nudge(e.shiftKey ? -10 : -1)}
            className="h-5 w-5 rounded border border-stone-300 bg-white text-xs leading-none text-stone-700 hover:bg-stone-100"
            title={`− ${step}${unit} (Maj : × 10)`}
          >
            −
          </button>
          <input
            ref={field}
            type="text"
            inputMode="decimal"
            value={text}
            onFocus={(e) => { setEditing(true); e.target.select(); }}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
              if (e.key === 'Escape') { setText(shown); setEditing(false); (e.target as HTMLInputElement).blur(); }
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { // flèches : ± un pas
                e.preventDefault();
                const v = parseFloat(text.replace(',', '.'));
                const next = Math.min(max, Math.max(min, (Number.isNaN(v) ? value : v) + (e.key === 'ArrowUp' ? step : -step)));
                setText(next.toFixed(digits));
                onChange(next);
              }
            }}
            className="w-14 rounded border border-transparent bg-transparent px-1 text-right hover:border-stone-300 focus:border-emerald-500 focus:bg-white focus:outline-none"
            title="Clique et tape une valeur"
          />
          {unit && <span className="text-stone-500">{unit}</span>}
          <button
            type="button"
            onClick={(e) => nudge(e.shiftKey ? 10 : 1)}
            className="h-5 w-5 rounded border border-stone-300 bg-white text-xs leading-none text-stone-700 hover:bg-stone-100"
            title={`+ ${step}${unit} (Maj : × 10)`}
          >
            +
          </button>
        </span>
      </span>
      <input
        ref={range}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        onDoubleClick={() => onChange(min <= 0 && max >= 0 ? 0 : min)}
        onPointerDown={() => { lastTouched = range.current; }}
      />
      {marks && marks.length > 0 && (
        <span className="relative block h-3">
          {marks.map((m, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onChange(Math.min(max, Math.max(min, m.at)))}
              title={m.label ? `${m.label} : ${m.at}${unit}` : `${m.at}${unit}`}
              style={{ left: `${((m.at - min) / (max - min)) * 100}%` }}
              className="absolute top-0 -translate-x-1/2 text-[9px] leading-none text-emerald-700 hover:text-emerald-900"
            >
              <span className="block h-1.5 w-px bg-emerald-600 mx-auto" />
              {m.label && <span>{m.label}</span>}
            </button>
          ))}
        </span>
      )}
    </label>
  );
}
