import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

/** Petits composants d'interface partagés : un seul style de bouton, de section et d'onglet dans toute l'app. */

type Variant = 'primary' | 'secondary' | 'danger' | 'warn' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-emerald-700 text-white hover:bg-emerald-800 border-emerald-700',
  secondary: 'bg-white text-stone-800 hover:bg-stone-100 border-stone-300',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 border-rose-600',
  warn: 'bg-amber-600 text-white hover:bg-amber-700 border-amber-600',
  ghost: 'bg-transparent text-stone-600 hover:bg-stone-100 border-transparent',
};

/** Bouton : `primary` pour l'action principale d'un bloc, `secondary` pour le reste, `danger` pour supprimer, `warn` pour annuler. */
export function Btn({ variant = 'secondary', block = true, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; block?: boolean }) {
  return (
    <button
      {...props}
      className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${block ? 'w-full' : ''} ${VARIANTS[variant]} ${className}`}
    />
  );
}

/** Petit bouton à bascule (préréglage, direction, axe…). */
export function Chip({ active, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...props}
      className={`rounded border px-2 py-0.5 text-[11px] transition-colors ${active ? 'border-emerald-600 bg-emerald-50 font-semibold text-emerald-900' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-100'} ${className}`}
    />
  );
}

const OPEN_KEY = (title: string) => `ui-section:${title}`;
const readOpen = (title: string, fallback: boolean): boolean => { try { const v = localStorage.getItem(OPEN_KEY(title)); return v === null ? fallback : v === '1'; } catch { return fallback; } };

/**
 * Section repliable : titre cliquable avec un chevron, contenu espacé. L'état ouvert / replié est gardé par titre dans
 * localStorage (`ui-section:<titre>`), pour que chacun garde sa disposition d'un chargement à l'autre.
 */
export function Section({ title, children, defaultOpen = false, note }: { title: string; children: ReactNode; defaultOpen?: boolean; note?: string }) {
  const [open, setOpen] = useState(() => readOpen(title, defaultOpen));
  const toggle = () => { setOpen((o) => { try { localStorage.setItem(OPEN_KEY(title), o ? '0' : '1'); } catch { /* rien */ } return !o; }); };
  return (
    <section className="rounded-lg border border-stone-200 bg-white/70">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-stone-700 select-none hover:bg-stone-100/70">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className={`inline-block w-3 text-stone-400 transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
          {title}
        </span>
        {note && <span className="text-[10px] font-normal text-stone-400">{note}</span>}
      </button>
      {open && <div className="space-y-2.5 border-t border-stone-100 px-3 py-3">{children}</div>}
    </section>
  );
}

/** Texte d'aide discret. */
export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-[11px] leading-snug text-stone-500">{children}</p>;
}

/** Message encadré : résultat, avertissement ou erreur. */
export function Notice({ kind = 'info', children }: { kind?: 'info' | 'ok' | 'warn' | 'error'; children: ReactNode }) {
  const tone = { info: 'bg-stone-100 text-stone-700', ok: 'bg-emerald-50 text-emerald-900', warn: 'bg-amber-50 text-amber-900', error: 'bg-red-50 text-red-800' }[kind];
  return <p className={`rounded-md px-2.5 py-1.5 text-[11px] leading-snug ${tone}`}>{children}</p>;
}

export interface TabDef<T extends string> { id: T; label: string; badge?: string | number }

/** Onglets en haut du panneau. */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: TabDef<T>[]; value: T; onChange: (id: T) => void }) {
  return (
    <div className="grid grid-cols-4 gap-1 rounded-lg bg-stone-200/70 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`rounded-md px-1 py-1.5 text-[11px] font-medium transition-colors ${value === t.id ? 'bg-white text-emerald-900 shadow-sm' : 'text-stone-600 hover:bg-white/60'}`}
        >
          {t.label}
          {t.badge !== undefined && <span className="ml-1 rounded-full bg-emerald-100 px-1 text-[9px] text-emerald-800">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}
