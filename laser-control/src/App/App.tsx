import { useCallback, useEffect, useState } from 'react';
import { FilesPanel } from '../components/FilesPanel';
import { indicator } from '../components/ConnectionBar/helpers';
import { LaserPanel } from '../components/LaserMachineModal';
import { StopButton } from '../components/StopButton';
import { useLaserMachine } from '../hooks/useLaserMachine';
import { EXAMPLE_SVG, itemFromFile, type LaserItem } from '../job';
import { StatusDot } from '../ui';

/** Application autonome : un SVG ou un G-code (ouvert ou déposé sur la page) devient un programme de la laser, piloté par le panneau habituel. */
export function App() {
  const [items, setItems] = useState<LaserItem[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const m = useLaserMachine(items);
  const ind = indicator(m.grbl);
  const locked = m.job.running;

  /** Ajoute les fichiers lus (les erreurs sont affichées) et choisit le dernier ajouté. Rien n'est envoyé : lancer demande un clic sur « Lancer la découpe ». */
  const load = useCallback(async (files: { name: string; text: () => Promise<string> }[]) => {
    const added: LaserItem[] = [], errs: string[] = [];
    for (const f of files) {
      try { added.push(itemFromFile(f.name, await f.text())); }
      catch (e) { errs.push(`${f.name} : ${e instanceof Error ? e.message : String(e)}`); }
    }
    setErrors(errs);
    if (added.length) {
      m.setItemIndex(items.length + added.length - 1);
      setItems((cur) => [...cur, ...added]);
    }
  }, [m, items.length]);

  const onFiles = useCallback((files: File[]) => { if (!locked) void load(files); }, [load, locked]);

  // glisser-déposer d'un fichier n'importe où sur la page
  useEffect(() => {
    const has = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const over = (e: DragEvent) => { if (has(e)) { e.preventDefault(); setDragging(true); } };
    const leave = (e: DragEvent) => { if (e.relatedTarget === null) setDragging(false); };
    const drop = (e: DragEvent) => { if (!has(e)) return; e.preventDefault(); setDragging(false); onFiles([...(e.dataTransfer?.files ?? [])]); };
    window.addEventListener('dragover', over); window.addEventListener('dragleave', leave); window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop); };
  }, [onFiles]);

  const remove = (i: number) => {
    setItems((cur) => cur.filter((_, k) => k !== i));
    m.setItemIndex(Math.max(0, m.itemIndex - (i <= m.itemIndex ? 1 : 0)));
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b border-stone-200 bg-white px-4 py-2">
        <h1 className="text-sm font-semibold text-stone-800">Laser Control — Sculpfun E1 Pro 21 W</h1>
        <StatusDot tone={ind.tone} pulse={ind.pulse}>{ind.label}</StatusDot>
        {m.job.running && <StopButton onStop={() => void m.job.stop()} />}
      </header>
      <LaserPanel
        m={m}
        top={<FilesPanel m={m} errors={errors} onFiles={onFiles} onRemove={remove} onExample={() => void load([{ name: 'exemple.svg', text: async () => EXAMPLE_SVG }])} />}
      />
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center border-4 border-dashed border-emerald-500 bg-emerald-50/80 text-lg font-semibold text-emerald-800">
          Dépose un SVG ou un G-code pour le charger
        </div>
      )}
    </div>
  );
}
