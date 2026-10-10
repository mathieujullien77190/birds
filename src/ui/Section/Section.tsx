import { useState, type ReactNode } from 'react';
import { OPEN_KEY, readOpen } from './helpers';

/**
 * Section repliable : titre-bouton avec chevron ▸. L'état ouvert / replié est gardé dans
 * localStorage (`ui-section-v2:<titre>`), pour que chacun garde sa disposition d'un chargement à l'autre.
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
