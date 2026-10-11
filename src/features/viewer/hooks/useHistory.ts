import { useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { HistoryEntry, PlankScene } from '@/birdhouse/model';

/** Nombre maximal d'étapes gardées pour « Retour » (les plus anciennes sont lâchées). */
export const MAX_UNDO = 50;

/**
 * « Retour » : états précédents en mémoire, le plus récent en dernier, `MAX_UNDO` au plus ; rien n'est enregistré au rechargement.
 * `onUndo` est appelé après un retour en arrière (pour ajuster la sélection et fermer la fenêtre de trou).
 */
export function useHistory(scRef: MutableRefObject<PlankScene>, setSc: Dispatch<SetStateAction<PlankScene>>, onUndo: (scene: PlankScene) => void) {
  const history = useRef<HistoryEntry[]>([]);
  const [backLabel, setBackLabel] = useState<string | null>(null);
  const onUndoRef = useRef(onUndo);
  onUndoRef.current = onUndo;

  /** Toute modification passe ici : l'état d'avant est gardé pour « Retour » (un même geste répété en moins d'une seconde — curseur, glissé — ne fait qu'une entrée). */
  const commit = (label: string, next: (s: PlankScene) => PlankScene, merge = false) => {
    const prev = scRef.current;
    const top = history.current[history.current.length - 1];
    const now = Date.now();
    if (top && top.label === label && (now - top.at < 1000 || merge)) top.at = now; // `merge` : se fond dans l'entrée précédente de même nom, quel que soit le délai
    else { history.current.push({ label, scene: prev, at: now }); if (history.current.length > MAX_UNDO) history.current.shift(); }
    setBackLabel(label);
    const n = next(prev);
    scRef.current = n;
    setSc(n);
  };
  /** Ajoute une entrée « état d'avant » sans rien changer (début d'un glissé dans la 3D). */
  const pushEntry = (label: string) => {
    history.current.push({ label, scene: scRef.current, at: Date.now() });
    if (history.current.length > MAX_UNDO) history.current.shift();
    setBackLabel(label);
  };
  /** Revient à l'état d'avant l'action n° `index` (elle et les suivantes sont annulées) ; sans index : la dernière. */
  const undoTo = (index = history.current.length - 1) => {
    const e = history.current[index];
    if (!e) return;
    history.current.length = index;
    scRef.current = e.scene;
    setSc(e.scene);
    onUndoRef.current(e.scene);
    setBackLabel(history.current.length ? history.current[history.current.length - 1].label : null);
  };
  const back = () => undoTo();
  return { history, backLabel, commit, pushEntry, undoTo, back };
}
