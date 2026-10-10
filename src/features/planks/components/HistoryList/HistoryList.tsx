import { Btn, Hint } from '@/ui';
import type { HistoryEntry } from '@/planks/model';

const timeOf = (at?: number) => (at ? new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '');

/** Contenu du volet « Historique » : toutes les actions (la plus récente en haut), ↶ seulement sur la dernière ligne, bouton pour vider. `histN` force le redessin (l'historique est une ref). */
export function HistoryList({ entries, histN, undoTo, clearHistory }: { entries: HistoryEntry[]; histN: number; undoTo: (i: number) => void; clearHistory: () => void }) {
  return (
    <>
      {entries.length === 0 ? <Hint>Aucune action pour l'instant.</Hint> : (
        <ul className="space-y-0.5 text-[11px]" data-n={histN}>
          {entries.map((e, i) => ({ e, i })).reverse().map(({ e, i }) => (
            <li key={i} className="flex items-center gap-2 rounded px-1.5 py-0.5 hover:bg-stone-100">
              <span className="w-5 text-right text-stone-400">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-stone-700">{e.label}</span>
              <span className="text-[10px] text-stone-400">{timeOf(e.at)}</span>
              {i === entries.length - 1 ? <button onClick={() => undoTo(i)} title="Annuler la dernière action" className="rounded border border-stone-300 bg-white px-1.5 py-0.5 text-[10px] hover:bg-stone-100">↶</button> : <span className="w-6" />}
            </li>
          ))}
        </ul>
      )}
      {entries.length > 0 && <Btn variant="warn" onClick={clearHistory}>Vider l'historique</Btn>}
    </>
  );
}
