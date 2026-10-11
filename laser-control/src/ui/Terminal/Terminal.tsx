import { useEffect, useRef } from 'react';
import { TONES, type TerminalLine } from './constants';

/** Journal à défilement automatique en police fixe (échanges avec une machine, sortie d'un programme…). */
export function Terminal({ lines, height = 'h-40', empty = 'Rien pour le moment.' }: { lines: TerminalLine[]; height?: string; empty?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useEffect(() => { const el = box.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [lines]);
  return (
    <div
      ref={box}
      onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; }}
      className={`${height} overflow-y-auto rounded-md bg-stone-900 p-2 font-mono text-[10px] leading-snug`}
    >
      {lines.length === 0 && <span className="text-stone-500">{empty}</span>}
      {lines.map((l) => <div key={l.id} className={`break-all whitespace-pre-wrap ${TONES[l.tone]}`}>{l.text}</div>)}
    </div>
  );
}
