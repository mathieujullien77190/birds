import { useRef, useState, type TouchEvent } from 'react';
import { KIND_LABEL, assemblyBlocks, type AssemblyStep } from '@/birdhouse/model';
import { IconButton } from '@/ui';
import { parseText, progressOf, swipeDirection } from './helpers';

/**
 * Panneau « Montage » : titre, consigne, progression et boutons Précédent / Suivant.
 * Téléphone : feuille en bas (au plus ~40 % de la hauteur), grands boutons à portée du pouce, balayage horizontal pour changer d'étape,
 * repliable en une barre fine (titre + « 12 / 140 »). Bureau : fiche flottante en bas à droite de la vue.
 */
export function AssemblyPanel({ steps, index, setIndex, onClose, mobile }: { steps: AssemblyStep[]; index: number; setIndex: (i: number) => void; onClose: () => void; mobile: boolean }) {
  const [folded, setFolded] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const step = steps[index];
  if (!step) return null;
  const { label, percent } = progressOf(index, steps.length);
  const blocks = assemblyBlocks(steps);
  const go = (d: number) => setIndex(index + d);
  const onTouchStart = (e: TouchEvent) => { const t = e.touches[0]; touch.current = t ? { x: t.clientX, y: t.clientY } : null; };
  const onTouchEnd = (e: TouchEvent) => {
    const t = e.changedTouches[0], s = touch.current;
    touch.current = null;
    if (!t || !s) return;
    const d = swipeDirection(t.clientX - s.x, t.clientY - s.y);
    if (d) go(d);
  };
  const pos = mobile ? 'inset-x-0 bottom-0 max-h-[40%] rounded-t-xl' : 'bottom-14 right-3 w-[26rem] max-h-[calc(60%-2.5rem)] rounded-lg';
  const body = mobile ? 'text-base' : 'text-sm';
  const btn = 'flex h-12 flex-1 items-center justify-center rounded-lg text-base font-medium disabled:opacity-40';
  if (folded) {
    return (
      <button type="button" aria-label="Rouvrir le montage" onClick={() => setFolded(false)}
        className={`absolute z-20 flex items-center gap-2 border border-stone-200 bg-white/95 px-3 py-2 text-left shadow-md ${mobile ? 'inset-x-0 bottom-0 rounded-t-xl' : 'bottom-14 right-3 w-[26rem] rounded-lg'}`}>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-900">{step.title}</span>
        <span className="shrink-0 text-sm text-stone-500">{label}</span>
      </button>
    );
  }
  return (
    <section aria-label="Montage pas à pas" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ touchAction: 'pan-y' }}
      className={`absolute z-20 flex flex-col overflow-hidden border border-stone-200 bg-white/95 text-stone-800 shadow-lg backdrop-blur ${pos}`}>
      <header className="flex items-center gap-2 border-b border-stone-200 px-3 py-1.5">
        <select aria-label="Aller à un bloc" value={step.block} onChange={(e) => { const b = blocks.find((x) => x.id === e.target.value); if (b) setIndex(b.first); }}
          className="min-w-0 flex-1 truncate rounded border border-stone-200 bg-white px-1 py-1 text-xs text-stone-700">
          {blocks.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
        </select>
        <span className="shrink-0 text-xs text-stone-500">Étape {label}</span>
        <IconButton size="md" onClick={() => setFolded(true)} aria-label="Replier le montage" title="Replier">▾</IconButton>
        <IconButton size="md" onClick={onClose} aria-label="Quitter le montage" title="Quitter le montage (Échap)">×</IconButton>
      </header>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-1 w-full shrink-0 bg-stone-100">
        <div className="h-full bg-amber-500" style={{ width: `${percent}%` }} />
      </div>
      <div className={`min-h-0 flex-1 overflow-y-auto px-3 py-2 ${body}`}>
        <h2 className="mb-1 font-semibold text-stone-900"><span className="mr-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">{KIND_LABEL[step.kind]}</span>{step.title}</h2>
        {parseText(step.text).map((b, i) => b.type === 'p'
          ? <p key={i} className="mb-1.5">{b.text}</p>
          : <ul key={i} className="mb-1.5 list-disc pl-5">{b.items.map((it, k) => <li key={k}>{it}</li>)}</ul>)}
      </div>
      <footer className="flex shrink-0 gap-2 border-t border-stone-200 p-2">
        <button type="button" className={`${btn} bg-stone-100 text-stone-800 hover:bg-stone-200`} disabled={index <= 0} onClick={() => go(-1)}>◀ Précédent</button>
        <button type="button" className={`${btn} bg-amber-500 text-white hover:bg-amber-600`} disabled={index >= steps.length - 1} onClick={() => go(1)}>Suivant ▶</button>
      </footer>
    </section>
  );
}
