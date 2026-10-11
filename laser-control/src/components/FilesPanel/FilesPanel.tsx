import { useRef } from 'react';
import { Btn, Hint, IconButton, Notice, Section } from '../../ui';
import type { LaserMachine } from '../../hooks/useLaserMachine';

/** Fichiers à découper : ouvrir un SVG ou un G-code (ou le déposer sur la page), choisir lequel piloter, retirer, charger l'exemple. */
export function FilesPanel({ m, errors, onFiles, onExample, onRemove }: {
  m: LaserMachine; errors: string[]; onFiles: (files: File[]) => void; onExample: () => void; onRemove: (index: number) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const locked = m.job.running;
  return (
    <Section title="Fichier à découper" defaultOpen note={m.items.length ? `${m.items.length} fichier${m.items.length > 1 ? 's' : ''}` : undefined}>
      <input
        ref={input} type="file" multiple hidden accept=".svg,.gcode,.gc,.nc,.ngc,.tap,.txt,image/svg+xml"
        onChange={(e) => { onFiles([...(e.target.files ?? [])]); e.target.value = ''; }}
      />
      <div className="flex flex-wrap gap-2">
        <Btn block={false} variant="primary" disabled={locked} onClick={() => input.current?.click()}>Ouvrir un SVG / G-code…</Btn>
        <Btn block={false} disabled={locked} onClick={onExample}>Exemple</Btn>
      </div>
      <Hint>Tu peux aussi déposer le fichier n'importe où sur la page. SVG : 1 unité = 1 mm, traits noirs = coupe, traits bleus = gravure, le viewBox est la planche. G-code : envoyé tel quel.</Hint>
      {errors.map((e) => <Notice key={e} kind="error">{e}</Notice>)}
      {m.items.length === 0 && <p className="text-[11px] text-stone-500">Aucun fichier chargé.</p>}
      <ul className="space-y-1">
        {m.items.map((it, i) => (
          <li key={`${it.label}-${i}`} className="flex items-center gap-1.5 text-[11px]">
            <button
              type="button" disabled={locked && i !== m.itemIndex} onClick={() => { m.setItemIndex(i); m.setTarget('sheet'); }}
              className={`min-w-0 flex-1 truncate rounded px-1.5 py-1 text-left ${i === m.itemIndex && m.target === 'sheet' ? 'bg-emerald-50 font-semibold text-emerald-800' : 'text-stone-700 hover:bg-stone-100'}`}
              title={it.label}
            >
              {it.job ? `${it.label} — ${Math.round(it.job.widthMm * 10) / 10} × ${Math.round(it.job.heightMm * 10) / 10} mm` : `${it.label} — G-code`}
            </button>
            <IconButton size="sm" disabled={locked} onClick={() => onRemove(i)} aria-label={`Retirer ${it.label}`} title="Retirer">×</IconButton>
          </li>
        ))}
      </ul>
    </Section>
  );
}
