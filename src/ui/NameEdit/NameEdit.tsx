import { useState } from 'react';

/** Nom cliquable : un clic choisit ; un clic sur le nom déjà choisi (ou un double-clic) permet de le renommer (Entrée / clic ailleurs : valide, Échap : annule). */
export function NameEdit({ value, active, onSelect, onRename, prefix = '', title }: { value: string; active: boolean; onSelect: (e: React.MouseEvent) => void; onRename: (v: string) => void; prefix?: string; title?: string }) {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(value);
  const done = (ok: boolean) => { setEdit(false); const v = text.trim(); if (ok && v && v !== value) onRename(v); };
  if (edit) return <input autoFocus value={text} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setText(e.target.value)} onBlur={() => done(true)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') done(true); else if (e.key === 'Escape') done(false); }} onClick={(e) => e.stopPropagation()} className="min-w-0 flex-1 rounded border border-emerald-400 bg-white px-1 py-0.5 text-[11px] font-semibold text-stone-800 outline-none" />;
  const start = () => { setText(value); setEdit(true); };
  return <button onClick={(e) => { if (active && !e.ctrlKey && !e.metaKey) start(); else onSelect(e); }} onDoubleClick={start} className="min-w-0 flex-1 whitespace-normal text-left font-semibold leading-tight text-stone-800 [overflow-wrap:anywhere]" title={title ?? 'Clique à nouveau pour renommer'}>{prefix}{value}</button>;
}
